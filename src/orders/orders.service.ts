import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { CartService } from '../cart/cart.service';
import { CheckoutService } from '../checkout/checkout.service';
import { CreateOrderDto, UpdateOrderStatusDto, OrderQueryDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
    constructor(
        @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
        private readonly cartService: CartService,
        private readonly checkoutService: CheckoutService,
    ) { }

    private generateOrderNumber(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ORD-${timestamp}-${random}`;
    }

    async createOrder(tenantId: string, userId: string, createDto: CreateOrderDto): Promise<Order> {
        const { orderItems, subtotal, tax, shippingCost, total } =
            await this.checkoutService.buildFromCart(tenantId, userId);

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
        await this.checkoutService.fulfillInventory(tenantId, orderItems);
        await this.cartService.clearCart(tenantId, userId);
        return savedOrder;
    }

    async getUserOrders(tenantId: string, userId: string, query: OrderQueryDto = {}): Promise<{ orders: Order[]; total: number }> {
        const { status, page = 1, limit = 10 } = query;
        const filter: Record<string, unknown> = {
            tenantId: new Types.ObjectId(tenantId),
            userId: new Types.ObjectId(userId),
        };
        if (status) filter.status = status;

        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
            this.orderModel.countDocuments(filter),
        ]);
        return { orders, total };
    }

    async getOrderById(tenantId: string, orderId: string, userId?: string): Promise<Order | null> {
        const filter: Record<string, unknown> = {
            _id: new Types.ObjectId(orderId),
            tenantId: new Types.ObjectId(tenantId),
        };
        if (userId) filter.userId = new Types.ObjectId(userId);
        return this.orderModel.findOne(filter).exec();
    }

    async getOrderByNumber(tenantId: string, orderNumber: string, userId?: string): Promise<Order | null> {
        const filter: Record<string, unknown> = {
            orderNumber,
            tenantId: new Types.ObjectId(tenantId),
        };
        if (userId) filter.userId = new Types.ObjectId(userId);
        return this.orderModel.findOne(filter).exec();
    }

    async getAllOrders(tenantId: string, query: OrderQueryDto = {}): Promise<{ orders: Order[]; total: number }> {
        const { status, page = 1, limit = 20 } = query;
        const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
        if (status) filter.status = status;

        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
            this.orderModel.countDocuments(filter),
        ]);
        return { orders, total };
    }

    async updateOrderStatus(tenantId: string, orderId: string, updateDto: UpdateOrderStatusDto): Promise<Order | null> {
        const order = await this.getOrderById(tenantId, orderId);
        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (
            updateDto.status === OrderStatus.CANCELLED &&
            order.status !== OrderStatus.CANCELLED &&
            order.status !== OrderStatus.PAYMENT_PENDING &&
            order.status !== OrderStatus.PAYMENT_FAILED
        ) {
            await this.checkoutService.restoreInventory(tenantId, order.items);
        }

        return this.orderModel.findOneAndUpdate(
            { _id: new Types.ObjectId(orderId), tenantId: new Types.ObjectId(tenantId) },
            { status: updateDto.status, cancelReason: updateDto.cancelReason },
            { new: true },
        ).exec();
    }

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
                status: OrderStatus.PENDING,
            }),
            this.orderModel.aggregate([
                {
                    $match: {
                        tenantId: new Types.ObjectId(tenantId),
                        status: { $nin: [OrderStatus.CANCELLED] },
                    },
                },
                { $group: { _id: null, total: { $sum: '$total' } } },
            ]),
            this.orderModel.countDocuments({
                tenantId: new Types.ObjectId(tenantId),
                createdAt: { $gte: today },
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
