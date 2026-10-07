import { IsString, IsNumber, Min, Max, IsOptional, IsArray, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AddToCartDto {
    @IsString()
    productId: string;

    @IsNumber()
    @Min(1)
    quantity: number;

    @IsOptional()
    @IsString()
    variantId?: string;
}

export class UpdateCartItemDto {
    @IsNumber()
    @Min(0)
    quantity: number;

    @IsOptional()
    @IsString()
    variantId?: string;
}

/** One line of a guest (logged-out) cart kept in the browser. */
export class GuestCartItemDto {
    @IsString()
    productId: string;

    @IsOptional()
    @IsString()
    variantId?: string;

    @IsNumber()
    @Min(1)
    @Max(99)
    quantity: number;
}

export class GuestCartDto {
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => GuestCartItemDto)
    items: GuestCartItemDto[];
}
