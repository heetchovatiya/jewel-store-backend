import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InventoryDocument = Inventory & Document;

@Schema({ timestamps: true })
export class Inventory {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
    productId: Types.ObjectId;

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

// Compound index for tenant + product uniqueness
InventorySchema.index({ tenantId: 1, productId: 1 }, { unique: true });
InventorySchema.index({ tenantId: 1, sku: 1 });
