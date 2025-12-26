import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

export enum OrderStatus {
    PENDING = 'pending',
    CONFIRMED = 'confirmed',
    PROCESSING = 'processing',
    SHIPPED = 'shipped',
    DELIVERED = 'delivered',
    CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class OrderItem {
    @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
    productId: Types.ObjectId;

    @Prop({ required: true })
    title: string;

    @Prop({ required: true })
    price: number;

    @Prop()
    image: string;

    @Prop({ required: true, min: 1 })
    quantity: number;

    @Prop()
    sku: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema()
export class ShippingAddress {
    @Prop({ required: true })
    fullName: string;

    @Prop({ required: true })
    phone: string;

    @Prop({ required: true })
    addressLine1: string;

    @Prop()
    addressLine2: string;

    @Prop({ required: true })
    city: string;

    @Prop({ required: true })
    state: string;

    @Prop({ required: true })
    pincode: string;
}

export const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);

@Schema({ timestamps: true })
export class Order {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
    userId: Types.ObjectId;

    @Prop({ required: true, unique: true })
    orderNumber: string;

    @Prop({ type: [OrderItemSchema], required: true })
    items: OrderItem[];

    @Prop({ required: true })
    subtotal: number;

    @Prop({ default: 0 })
    tax: number;

    @Prop({ default: 0 })
    shippingCost: number;

    @Prop({ required: true })
    total: number;

    @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING, index: true })
    status: OrderStatus;

    @Prop({ type: ShippingAddressSchema, required: true })
    shippingAddress: ShippingAddress;

    @Prop()
    notes: string;

    @Prop()
    cancelReason: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Indexes
OrderSchema.index({ tenantId: 1, createdAt: -1 });
OrderSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
