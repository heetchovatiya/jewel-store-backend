import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadDocument = Lead & Document;

export enum LeadStatus {
    PENDING = 'pending',
    CONTACTED = 'contacted',
    INTERESTED = 'interested',
    SOLD = 'sold',
    CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class Lead {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true })
    customerName: string;

    @Prop({ required: true })
    customerPhone: string;

    @Prop()
    customerEmail: string;

    @Prop({ type: Types.ObjectId, ref: 'Product' })
    productId: Types.ObjectId;

    @Prop()
    productTitle: string;

    @Prop({ type: String, enum: LeadStatus, default: LeadStatus.PENDING, index: true })
    status: LeadStatus;

    @Prop()
    notes: string;

    @Prop()
    source: string;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

LeadSchema.index({ tenantId: 1, createdAt: -1 });
