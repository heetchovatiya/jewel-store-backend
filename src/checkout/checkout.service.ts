import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { CartService } from '../cart/cart.service';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderItem } from '../orders/order.schema';
import { CartItem as CartItemDto } from '../types/commerce';

export interface BuiltCheckout {
    orderItems: OrderItem[];
    subtotal: number;
    tax: number;
    shippingCost: number;
    total: number;
}

@Injectable()
export class CheckoutService {
    constructor(
        private readonly cartService: CartService,
        private readonly productsService: ProductsService,
        private readonly inventoryService: InventoryService,
    ) { }

    async buildFromCart(tenantId: string, userId: string): Promise<BuiltCheckout> {
        const cart = await this.cartService.getCart(tenantId, userId);
        if (cart.items.length === 0) {
            throw new BadRequestException('Cart is empty');
        }

        const orderItems: OrderItem[] = [];

        for (const cartItem of cart.items) {
            const orderItem = await this.validateCartLine(tenantId, cartItem);
            orderItems.push(orderItem);
        }

        const subtotal = cart.total;
        const tax = 0;
        const shippingCost = 0;
        const total = subtotal + tax + shippingCost;

        return { orderItems, subtotal, tax, shippingCost, total };
    }

    private async validateCartLine(tenantId: string, cartItem: CartItemDto): Promise<OrderItem> {
        const productId = cartItem.productId;
        const product = await this.productsService.findById(tenantId, productId);

        if (!product || !product.isActive) {
            throw new BadRequestException(`Product unavailable: ${cartItem.title}`);
        }

        const variantId = cartItem.variantId?.toString();

        if (variantId) {
            const variant = this.productsService.getVariant(product, variantId);
            if (!variant || variant.isActive === false) {
                throw new BadRequestException(`Variant no longer available for "${cartItem.title}"`);
            }
        } else if (this.productsService.hasVariants(product)) {
            throw new BadRequestException(`Please select options for "${product.title}"`);
        }

        const stock = await this.inventoryService.assertAvailable(
            tenantId,
            productId,
            variantId,
            cartItem.quantity,
            cartItem.title,
        );

        return {
            productId: new Types.ObjectId(productId),
            variantId: cartItem.variantId ? new Types.ObjectId(cartItem.variantId) : undefined,
            size: cartItem.size,
            color: cartItem.color,
            title: cartItem.title,
            price: cartItem.price,
            image: cartItem.image,
            quantity: cartItem.quantity,
            sku: cartItem.sku || stock.sku || '',
        } as OrderItem;
    }

    async fulfillInventory(tenantId: string, items: OrderItem[]): Promise<void> {
        for (const item of items) {
            await this.inventoryService.decrement(
                tenantId,
                item.productId.toString(),
                item.variantId?.toString(),
                item.quantity,
                item.title,
            );
        }
    }

    async restoreInventory(tenantId: string, items: OrderItem[]): Promise<void> {
        for (const item of items) {
            await this.inventoryService.increment(
                tenantId,
                item.productId.toString(),
                item.variantId?.toString(),
                item.quantity,
            );
        }
    }
}
