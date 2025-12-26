import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus, OrderItem } from './order.schema';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto, UpdateOrderStatusDto, OrderQueryDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
    constructor(
        @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
        private readonly cartService: CartService,
        private readonly productsService: ProductsService,
    ) { }

    private generateOrderNumber(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ORD-${timestamp}-${random}`;
    }

    async createOrder(tenantId: string, userId: string, createDto: CreateOrderDto): Promise<Order> {
        // Get cart
        const cart = await this.cartService.getCart(tenantId, userId);

        if (cart.items.length === 0) {
            throw new BadRequestException('Cart is empty');
        }

        // Validate and prepare order items
        const orderItems: OrderItem[] = [];

        for (const cartItem of cart.items) {
            const inventory = await this.productsService.getInventory(tenantId, cartItem.productId.toString());

            if (inventory && inventory.trackInventory) {
                if (cartItem.quantity > inventory.stock && !inventory.allowBackorder) {
                    throw new BadRequestException(
                        `Not enough stock for "${cartItem.title}". Available: ${inventory.stock}`
                    );
                }
            }

            orderItems.push({
                productId: cartItem.productId,
                title: cartItem.title,
                price: cartItem.price,
                image: cartItem.image,
                quantity: cartItem.quantity,
                sku: inventory?.sku || '',
            } as OrderItem);
        }

        // Calculate totals
        const subtotal = cart.total;
        const tax = 0; // Can be calculated based on region
        const shippingCost = 0; // Can be calculated based on address
        const total = subtotal + tax + shippingCost;

        // Create order
        const order = new this.orderModel({
            tenantId: new Types.ObjectId(tenantId),
            userId: new Types.ObjectId(userId),
            orderNumber: this.generateOrderNumber(),
            items: orderItems,
            subtotal,
            tax,
            shippingCost,
            total,
            status: OrderStatus.PENDING,
            shippingAddress: createDto.shippingAddress,
            notes: createDto.notes,
        });

        const savedOrder = await order.save();

        // Deduct inventory
        for (const item of orderItems) {
            const inventory = await this.productsService.getInventory(tenantId, item.productId.toString());
            if (inventory && inventory.trackInventory) {
                await this.productsService.updateInventory(tenantId, item.productId.toString(), {
                    stock: Math.max(0, inventory.stock - item.quantity),
                });
            }
        }

        // Clear cart
        await this.cartService.clearCart(tenantId, userId);

        return savedOrder;
    }

    async getUserOrders(tenantId: string, userId: string, query: OrderQueryDto = {}): Promise<{ orders: Order[]; total: number }> {
        const { status, page = 1, limit = 10 } = query;

        const filter: any = {
            tenantId: new Types.ObjectId(tenantId),
            userId: new Types.ObjectId(userId),
        };

        if (status) {
            filter.status = status;
        }

        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            this.orderModel
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.orderModel.countDocuments(filter),
        ]);

        return { orders, total };
    }

    async getOrderById(tenantId: string, orderId: string, userId?: string): Promise<Order | null> {
        const filter: any = {
            _id: new Types.ObjectId(orderId),
            tenantId: new Types.ObjectId(tenantId),
        };

        if (userId) {
            filter.userId = new Types.ObjectId(userId);
        }

        return this.orderModel.findOne(filter).exec();
    }

    async getOrderByNumber(tenantId: string, orderNumber: string, userId?: string): Promise<Order | null> {
        const filter: any = {
            orderNumber,
            tenantId: new Types.ObjectId(tenantId),
        };

        if (userId) {
            filter.userId = new Types.ObjectId(userId);
        }

        return this.orderModel.findOne(filter).exec();
    }

    // Admin methods
    async getAllOrders(tenantId: string, query: OrderQueryDto = {}): Promise<{ orders: Order[]; total: number }> {
        const { status, page = 1, limit = 20 } = query;

        const filter: any = {
            tenantId: new Types.ObjectId(tenantId),
        };

        if (status) {
            filter.status = status;
        }

        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            this.orderModel
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.orderModel.countDocuments(filter),
        ]);

        return { orders, total };
    }

    async updateOrderStatus(tenantId: string, orderId: string, updateDto: UpdateOrderStatusDto): Promise<Order | null> {
        const order = await this.getOrderById(tenantId, orderId);

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        // If cancelling, restore inventory
        if (updateDto.status === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
            for (const item of order.items) {
                const inventory = await this.productsService.getInventory(tenantId, item.productId.toString());
                if (inventory && inventory.trackInventory) {
                    await this.productsService.updateInventory(tenantId, item.productId.toString(), {
                        stock: inventory.stock + item.quantity,
                    });
                }
            }
        }

        return this.orderModel.findOneAndUpdate(
            { _id: new Types.ObjectId(orderId), tenantId: new Types.ObjectId(tenantId) },
            { status: updateDto.status, cancelReason: updateDto.cancelReason },
            { new: true }
        ).exec();
    }

    // Dashboard stats
    async getOrderStats(tenantId: string): Promise<{
        totalOrders: number;
        pendingOrders: number;
        totalRevenue: number;
        todayOrders: number;
    }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalOrders, pendingOrders, revenueResult, todayOrders] = await Promise.all([
            this.orderModel.countDocuments({ tenantId: new Types.ObjectId(tenantId) }),
            this.orderModel.countDocuments({
                tenantId: new Types.ObjectId(tenantId),
                status: OrderStatus.PENDING
            }),
            this.orderModel.aggregate([
                {
                    $match: {
                        tenantId: new Types.ObjectId(tenantId),
                        status: { $nin: [OrderStatus.CANCELLED] }
                    }
                },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            this.orderModel.countDocuments({
                tenantId: new Types.ObjectId(tenantId),
                createdAt: { $gte: today }
            }),
        ]);

        return {
            totalOrders,
            pendingOrders,
            totalRevenue: revenueResult[0]?.total || 0,
            todayOrders,
        };
    }
}
