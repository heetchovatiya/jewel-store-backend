import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { StoreConfigService } from '../config/store-config.service';
import { Inventory, InventoryDocument } from '../products/inventory.schema';
import { Order, OrderDocument, OrderStatus } from '../orders/order.schema';
import { ShippingAddressDto } from '../orders/dto/order.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
        @InjectModel(Inventory.name) private readonly inventoryModel: Model<InventoryDocument>,
        private readonly cartService: CartService,
        private readonly productsService: ProductsService,
        private readonly storeConfigService: StoreConfigService,
        private readonly usersService: UsersService,
    ) { }

    private generateOrderNumber(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ORD-${timestamp}-${random}`;
    }

    private async getRazorpayCredentials(tenantId: string): Promise<{ keyId: string; keySecret: string }> {
        const config = await this.storeConfigService.getOrCreate(tenantId);
        const keyId = config.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
        const keySecret = config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            throw new InternalServerErrorException('Razorpay credentials are not configured');
        }

        return { keyId, keySecret };
    }

    private async calculateOrderFromCart(tenantId: string, userId: string) {
        const cart = await this.cartService.getCart(tenantId, userId);
        if (cart.items.length === 0) {
            throw new BadRequestException('Cart is empty');
        }

        const orderItems: Order['items'] = [];
        let subtotal = 0;

        for (const cartItem of cart.items) {
            const product = await this.productsService.findById(tenantId, cartItem.productId.toString());
            if (!product || !product.isActive) {
                throw new BadRequestException(`Product unavailable: ${cartItem.title}`);
            }

            const inventory = await this.productsService.getInventory(tenantId, cartItem.productId.toString());
            if (inventory && inventory.trackInventory) {
                if (cartItem.quantity > inventory.stock && !inventory.allowBackorder) {
                    throw new BadRequestException(
                        `Not enough stock for "${product.title}". Available: ${inventory.stock}`,
                    );
                }
            }

            const lineTotal = product.price * cartItem.quantity;
            subtotal += lineTotal;

            orderItems.push({
                productId: new Types.ObjectId(cartItem.productId.toString()),
                title: product.title,
                price: product.price,
                image: product.images?.[0] || cartItem.image,
                quantity: cartItem.quantity,
                sku: inventory?.sku || '',
            });
        }

        const tax = 0;
        const shippingCost = 0;
        const total = subtotal + tax + shippingCost;

        return { orderItems, subtotal, tax, shippingCost, total };
    }

    private async validateShippingAddressByPincode(shippingAddress: ShippingAddressDto) {
        const normalizedPin = (shippingAddress.pincode || '').trim();
        if (!/^\d{6}$/.test(normalizedPin)) {
            throw new BadRequestException('Please enter a valid 6-digit PIN code');
        }

        const response = await fetch(`https://api.postalpincode.in/pincode/${normalizedPin}`);
        if (!response.ok) {
            throw new BadRequestException('Unable to validate PIN code at the moment');
        }

        const data = await response.json();
        const record = data?.[0];
        const postOffices = Array.isArray(record?.PostOffice) ? record.PostOffice : [];

        if (record?.Status !== 'Success' || postOffices.length === 0) {
            throw new BadRequestException('Invalid PIN code');
        }

        const requestedCity = shippingAddress.city.trim().toLowerCase();
        const requestedState = shippingAddress.state.trim().toLowerCase();

        const matches = postOffices.some((office: any) => {
            const district = (office?.District || '').toString().trim().toLowerCase();
            const state = (office?.State || '').toString().trim().toLowerCase();
            return district === requestedCity && state === requestedState;
        });

        if (!matches) {
            throw new BadRequestException('PIN code does not match the selected city/state');
        }
    }

    async initiatePayment(tenantId: string, userId: string, shippingAddress: ShippingAddressDto) {
        await this.validateShippingAddressByPincode(shippingAddress);
        const { keyId, keySecret } = await this.getRazorpayCredentials(tenantId);
        const { orderItems, subtotal, tax, shippingCost, total } = await this.calculateOrderFromCart(tenantId, userId);
        const amountPaise = Math.round(total * 100);
        const orderNumber = this.generateOrderNumber();

        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const razorpayOrder = await razorpay.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: orderNumber,
            notes: { tenantId, userId, orderNumber },
        });

        const order = new this.orderModel({
            tenantId: new Types.ObjectId(tenantId),
            userId: new Types.ObjectId(userId),
            orderNumber,
            items: orderItems,
            subtotal,
            tax,
            shippingCost,
            total,
            status: OrderStatus.PAYMENT_PENDING,
            shippingAddress,
            razorpayOrderId: razorpayOrder.id,
        });

        const savedOrder = await order.save();

        return {
            orderId: savedOrder._id.toString(),
            orderNumber: savedOrder.orderNumber,
            razorpayOrderId: razorpayOrder.id,
            amount: amountPaise,
            keyId,
        };
    }

    async verifyCheckoutSignature(tenantId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
        const { keySecret } = await this.getRazorpayCredentials(tenantId);
        const expected = crypto
            .createHmac('sha256', keySecret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expected !== razorpaySignature) {
            throw new BadRequestException('Invalid payment signature');
        }

        const order = await this.orderModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            razorpayOrderId,
        }).exec();

        if (!order) {
            throw new BadRequestException('Order not found for provided payment');
        }

        return {
            orderId: order._id.toString(),
            status: order.status,
        };
    }

    async verifyWebhook(tenantId: string, rawBody: Buffer, signature: string | undefined) {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new InternalServerErrorException('Razorpay webhook secret is not configured');
        }
        if (!signature) {
            throw new BadRequestException('Missing webhook signature');
        }

        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (expected !== signature) {
            throw new BadRequestException('Invalid webhook signature');
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        const event = payload.event as string;

        if (event === 'payment.captured') {
            const payment = payload.payload?.payment?.entity;
            await this.handlePaymentCaptured(tenantId, payment);
        }

        if (event === 'payment.failed') {
            const payment = payload.payload?.payment?.entity;
            await this.handlePaymentFailed(tenantId, payment);
        }

        return { received: true };
    }

    private async handlePaymentCaptured(tenantId: string, payment: any) {
        if (!payment?.order_id || !payment?.id) {
            return;
        }

        const order = await this.orderModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            razorpayOrderId: payment.order_id,
        }).exec();

        if (!order) {
            this.logger.warn(`Captured payment without matching order: ${payment.order_id}`);
            return;
        }

        if (order.status === OrderStatus.CONFIRMED && order.razorpayPaymentId === payment.id) {
            return;
        }

        if (order.status !== OrderStatus.PAYMENT_PENDING) {
            return;
        }

        for (const item of order.items) {
            const inventory = await this.inventoryModel.findOne({
                tenantId: new Types.ObjectId(tenantId),
                productId: item.productId,
            }).exec();

            if (!inventory || !inventory.trackInventory || inventory.allowBackorder) {
                continue;
            }

            const updated = await this.inventoryModel.findOneAndUpdate(
                {
                    tenantId: new Types.ObjectId(tenantId),
                    productId: item.productId,
                    stock: { $gte: item.quantity },
                },
                { $inc: { stock: -item.quantity } },
                { new: true },
            ).exec();

            if (!updated) {
                throw new BadRequestException(`Insufficient stock during payment capture for ${item.title}`);
            }
        }

        await this.orderModel.findOneAndUpdate(
            {
                _id: order._id,
                tenantId: new Types.ObjectId(tenantId),
                status: OrderStatus.PAYMENT_PENDING,
            },
            {
                status: OrderStatus.CONFIRMED,
                razorpayPaymentId: payment.id,
                paymentCapturedAt: new Date(),
            },
        ).exec();

        await this.cartService.clearCart(tenantId, order.userId.toString());
        await this.usersService.upsertAddress(tenantId, order.userId.toString(), {
            fullName: order.shippingAddress.fullName,
            phone: order.shippingAddress.phone,
            addressLine1: order.shippingAddress.addressLine1,
            addressLine2: order.shippingAddress.addressLine2,
            city: order.shippingAddress.city,
            state: order.shippingAddress.state,
            pincode: order.shippingAddress.pincode,
        });
    }

    private async handlePaymentFailed(tenantId: string, payment: any) {
        if (!payment?.order_id) {
            return;
        }

        await this.orderModel.findOneAndUpdate(
            {
                tenantId: new Types.ObjectId(tenantId),
                razorpayOrderId: payment.order_id,
                status: OrderStatus.PAYMENT_PENDING,
            },
            {
                status: OrderStatus.PAYMENT_FAILED,
                razorpayPaymentId: payment.id || undefined,
            },
        ).exec();
    }
}
