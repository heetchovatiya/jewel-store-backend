import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true })
export class Product {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true })
    title: string;

    @Prop()
    description: string;

    @Prop({ required: true })
    price: number;

    @Prop()
    compareAtPrice: number;

    @Prop({ required: true })
    category: string;

    @Prop({ type: [String], default: [] })
    images: string[];

    @Prop({ type: [String], default: [] })
    videos: string[];

    @Prop({ type: Number, default: null })
    hoverImageIndex: number;

    @Prop({ required: true, index: true })
    slug: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ default: false, index: true })
    isFeatured: boolean;

    @Prop({ type: Object })
    specifications: Record<string, string>;

    @Prop({ type: [String], default: [] })
    tags: string[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Compound index for tenant + slug uniqueness
ProductSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
ProductSchema.index({ tenantId: 1, category: 1 });
ProductSchema.index({ tenantId: 1, isFeatured: 1 });
