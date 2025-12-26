import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
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

    @Patch('items/:productId')
    updateCartItem(
        @Req() req: Request,
        @Param('productId') productId: string,
        @Body() updateDto: UpdateCartItemDto
    ) {
        return this.cartService.updateCartItem(req.tenantId!, (req as any).user.userId, productId, updateDto);
    }

    @Delete('items/:productId')
    removeFromCart(@Req() req: Request, @Param('productId') productId: string) {
        return this.cartService.removeFromCart(req.tenantId!, (req as any).user.userId, productId);
    }

    @Delete()
    clearCart(@Req() req: Request) {
        return this.cartService.clearCart(req.tenantId!, (req as any).user.userId);
    }
}
