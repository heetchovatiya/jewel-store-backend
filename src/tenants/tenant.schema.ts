import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TenantDocument = Tenant & Document;

@Schema({ timestamps: true })
export class Tenant {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, unique: true, index: true })
    slug: string;

    @Prop()
    domain: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop()
    ownerEmail: string;

    @Prop()
    ownerPhone: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
