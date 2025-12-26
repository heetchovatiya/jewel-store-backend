import { IsString, IsOptional, IsArray, IsObject, IsBoolean, IsNumber, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

class CategoryDto {
    @IsString()
    name: string;

    @IsString()
    slug: string;

    @IsOptional()
    @IsBoolean()
    showInNavbar?: boolean;

    @IsOptional()
    @IsNumber()
    order?: number;

    @IsOptional()
    @IsString()
    image?: string;
}

class AboutUsDto {
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(2)
    images?: string[];
}

export class UpdateStoreConfigDto {
    @IsOptional()
    @IsString()
    storeName?: string;

    @IsOptional()
    @IsString()
    storeDescription?: string;

    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsString()
    faviconUrl?: string;

    @IsOptional()
    @IsString()
    primaryColor?: string;

    @IsOptional()
    @IsString()
    secondaryColor?: string;

    @IsOptional()
    @IsString()
    backgroundColor?: string;

    @IsOptional()
    @IsString()
    textColor?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    heroBanners?: string[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories?: CategoryDto[];

    @IsOptional()
    @ValidateNested()
    @Type(() => AboutUsDto)
    aboutUs?: AboutUsDto;

    @IsOptional()
    @IsString()
    contactEmail?: string;

    @IsOptional()
    @IsString()
    contactPhone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsObject()
    socialLinks?: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        whatsapp?: string;
    };

    @IsOptional()
    @IsObject()
    seo?: {
        metaTitle?: string;
        metaDescription?: string;
        keywords?: string[];
    };

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @IsString()
    currencySymbol?: string;
}
