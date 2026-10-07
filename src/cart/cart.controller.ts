import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto, GuestCartDto } from './dto/cart.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Public cart endpoints: usable by logged-out shoppers. */
@Controller('cart')
export class GuestCartController {
    constructor(private readonly cartService: CartService) { }

    /** Price/validate a browser-held guest cart. Nothing is saved. */
    @Post('preview')
    @HttpCode(HttpStatus.OK)
    preview(@Req() req: Request, @Body() dto: GuestCartDto) {
        return this.cartService.previewGuestCart(req.tenantId!, dto.items);
    }
}

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
    constructor(private readonly cartService: CartService) { }

    @Get()
    getCart(@Req() req: Request) {
        return this.cartService.getCart(req.tenantId!, (req as any).user.userId);
    }

    /** Merge the guest cart from the browser into this user's cart (call after login). */
    @Post('merge')
    @HttpCode(HttpStatus.OK)
    merge(@Req() req: Request, @Body() dto: GuestCartDto) {
        return this.cartService.mergeGuestCart(req.tenantId!, (req as any).user.userId, dto.items);
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
