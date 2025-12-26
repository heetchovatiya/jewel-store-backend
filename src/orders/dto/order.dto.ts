import { IsString, IsOptional, IsEnum, IsObject, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../order.schema';

export class ShippingAddressDto {
    @IsString()
    fullName: string;

    @IsString()
    phone: string;

    @IsString()
    addressLine1: string;

    @IsOptional()
    @IsString()
    addressLine2?: string;

    @IsString()
    city: string;

    @IsString()
    state: string;

    @IsString()
    pincode: string;
}

export class CreateOrderDto {
    @ValidateNested()
    @Type(() => ShippingAddressDto)
    shippingAddress: ShippingAddressDto;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateOrderStatusDto {
    @IsEnum(OrderStatus)
    status: OrderStatus;

    @IsOptional()
    @IsString()
    cancelReason?: string;
}

export class OrderQueryDto {
    @IsOptional()
    @IsEnum(OrderStatus)
    status?: OrderStatus;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number;
}
