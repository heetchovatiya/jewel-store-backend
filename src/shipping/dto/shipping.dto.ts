import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ServiceabilityQueryDto {
    @Matches(/^\d{6}$/, { message: 'Please enter a valid 6-digit PIN code' })
    pincode: string;
}

export class CreateWaybillDto {
    /** Parcel weight in kg (defaults to BLUEDART_DEFAULT_WEIGHT_KG). */
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0.05)
    @Max(50)
    weightKg?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(20)
    pieces?: number;

    /** yyyy-mm-dd; defaults to today (or tomorrow if past the pickup cut-off). */
    @IsOptional()
    @IsDateString()
    pickupDate?: string;

    /** Also book a Blue Dart pickup for this parcel. */
    @IsOptional()
    @IsBoolean()
    registerPickup?: boolean;
}
