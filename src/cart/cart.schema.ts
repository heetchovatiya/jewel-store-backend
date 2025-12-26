import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CartDocument = Cart & Document;

@Schema({ timestamps: true })
export class CartItem {
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
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({ timestamps: true })
export class Cart {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
    userId: Types.ObjectId;

    @Prop({ type: [CartItemSchema], default: [] })
    items: CartItem[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);

// Compound index for tenant + user uniqueness (one cart per user per tenant)
CartSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
