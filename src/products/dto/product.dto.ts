import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateProductDto {
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsNumber()
    @Min(0)
    price: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    compareAtPrice?: number;

    @IsString()
    category: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    images?: string[];

    @IsOptional()
    @IsNumber()
    hoverImageIndex?: number;

    @IsOptional()
    @IsString()
    slug?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsBoolean()
    isFeatured?: boolean;

    @IsOptional()
    specifications?: Record<string, string>;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    // Inventory fields for combined creation
    @IsOptional()
    @IsString()
    sku?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    stock?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    lowStockThreshold?: number;
}

export class UpdateProductDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    price?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    compareAtPrice?: number;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    images?: string[];

    @IsOptional()
    @IsNumber()
    hoverImageIndex?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsBoolean()
    isFeatured?: boolean;

    @IsOptional()
    specifications?: Record<string, string>;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];
}

export class UpdateInventoryDto {
    @IsOptional()
    @IsString()
    sku?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    stock?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    lowStockThreshold?: number;

    @IsOptional()
    @IsBoolean()
    trackInventory?: boolean;

    @IsOptional()
    @IsBoolean()
    allowBackorder?: boolean;
}

export class ProductQueryDto {
    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    featured?: boolean;

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

    @IsOptional()
    @IsString()
    sort?: string;
}
