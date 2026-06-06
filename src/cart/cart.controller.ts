import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
    constructor(private readonly cartService: CartService) { }

    @Get()
    getCart(@Req() req: Request) {
        return this.cartService.getCart(req.tenantId!, (req as any).user.userId);
    }

    @Post('items')
    addToCart(@Req() req: Request, @Body() addDto: AddToCartDto) {
        return this.cartService.addToCart(req.tenantId!, (req as any).user.userId, addDto);
    }

    @Patch('items/line/:lineId')
    updateCartItemByLineId(
        @Req() req: Request,
        @Param('lineId') lineId: string,
        @Body() updateDto: UpdateCartItemDto,
    ) {
        return this.cartService.updateCartItemByLineId(
            req.tenantId!,
            (req as any).user.userId,
            lineId,
            updateDto,
        );
    }

    @Delete('items/line/:lineId')
    removeFromCartByLineId(@Req() req: Request, @Param('lineId') lineId: string) {
        return this.cartService.removeFromCartByLineId(
            req.tenantId!,
            (req as any).user.userId,
            lineId,
        );
    }

    /** @deprecated Use PATCH /cart/items/line/:lineId */
    @Patch('items/:productId')
    updateCartItem(
        @Req() req: Request,
        @Param('productId') productId: string,
        @Body() updateDto: UpdateCartItemDto,
        @Query('variantId') variantId?: string,
    ) {
        const vid = updateDto.variantId || variantId;
        return this.cartService.updateCartItem(
            req.tenantId!,
            (req as any).user.userId,
            productId,
            updateDto,
            vid,
        );
    }

    /** @deprecated Use DELETE /cart/items/line/:lineId */
    @Delete('items/:productId')
    removeFromCart(
        @Req() req: Request,
        @Param('productId') productId: string,
        @Query('variantId') variantId?: string,
    ) {
        return this.cartService.removeFromCart(
            req.tenantId!,
            (req as any).user.userId,
            productId,
            variantId,
        );
    }

    @Delete()
    clearCart(@Req() req: Request) {
        return this.cartService.clearCart(req.tenantId!, (req as any).user.userId);
    }
}
