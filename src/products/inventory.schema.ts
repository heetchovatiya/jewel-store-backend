import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InventoryDocument = Inventory & Document;

@Schema({ timestamps: true })
export class Inventory {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
    productId: Types.ObjectId;

    /** Set for variant SKUs; null = simple product (single SKU) */
    @Prop({ type: Types.ObjectId, default: null })
    variantId: Types.ObjectId | null;

    @Prop()
    sku: string;

    @Prop({ required: true, default: 0 })
    stock: number;

    @Prop({ default: 5 })
    lowStockThreshold: number;

    @Prop({ default: true })
    trackInventory: boolean;

    @Prop({ default: false })
    allowBackorder: boolean;
}

export const InventorySchema = SchemaFactory.createForClass(Inventory);

// One row per sellable SKU (product-only or product+variant)
InventorySchema.index(
    { tenantId: 1, productId: 1, variantId: 1 },
    { unique: true },
);
InventorySchema.index({ tenantId: 1, sku: 1 });
InventorySchema.index({ tenantId: 1, stock: 1 });
