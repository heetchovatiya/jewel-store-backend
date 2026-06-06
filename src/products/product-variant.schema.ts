import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductVariantDocument = ProductVariant & Document;

@Schema({ _id: true })
export class ProductVariant {
    @Prop()
    size: string;

    @Prop()
    color: string;

    @Prop()
    price: number;

    @Prop()
    sku: string;

    @Prop({ default: 0 })
    stock: number;

    @Prop()
    image: string;

    @Prop({ default: true })
    isActive: boolean;
}

export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);
