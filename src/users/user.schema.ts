import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
    CUSTOMER = 'customer',
    ADMIN = 'admin',
    SUPER_ADMIN = 'super_admin',
}

@Schema({ timestamps: true })
export class Address {
    @Prop()
    label: string;

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

    @Prop({ default: false })
    isDefault: boolean;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ timestamps: true })
export class User {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    password: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    phone: string;

    @Prop({ type: String, enum: UserRole, default: UserRole.CUSTOMER })
    role: UserRole;

    @Prop({ type: [AddressSchema], default: [] })
    addresses: Address[];

    @Prop({ default: true })
    isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Compound index for tenant + email uniqueness
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
