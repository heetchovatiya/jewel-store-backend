import { IsString, IsOptional, IsEnum, IsEmail, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus } from '../lead.schema';

export class CreateLeadDto {
    @IsString()
    customerName: string;

    @IsString()
    customerPhone: string;

    @IsOptional()
    @IsEmail()
    customerEmail?: string;

    @IsOptional()
    @IsString()
    productId?: string;

    @IsOptional()
    @IsString()
    source?: string;
}

export class UpdateLeadDto {
    @IsOptional()
    @IsEnum(LeadStatus)
    status?: LeadStatus;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class LeadQueryDto {
    @IsOptional()
    @IsEnum(LeadStatus)
    status?: LeadStatus;

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
