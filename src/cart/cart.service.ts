import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument, CartItem } from './cart.schema';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto';
import { ProductVariant } from '../products/product-variant.schema';
import { CartItem as CartItemDto, CartResponse } from '../types/commerce';
import { getPublicUrl, toStorageKey } from '../common/media-url';

@Injectable()
export class CartService {
    constructor(
        @InjectModel(Cart.name) private cartModel: Model<CartDocument>,
        private readonly productsService: ProductsService,
        private readonly inventoryService: InventoryService,
    ) { }

    private toLineId(item: CartItem): string {
        return (item as any)._id?.toString();
    }

    private findItemIndexByLineId(cart: CartDocument, lineId: string): number {
        return cart.items.findIndex(item => this.toLineId(item) === lineId);
    }

    /** @deprecated Use lineId matching */
    private matchesCartItem(item: CartItem, productId: string, variantId?: string): boolean {
        const sameProduct = item.productId.toString() === productId;
        if (!variantId) {
            return sameProduct && !item.variantId;
        }
        return sameProduct && item.variantId?.toString() === variantId;
    }

    private serializeItem(item: CartItem): CartItemDto {
        const raw = typeof (item as any).toObject === 'function' ? (item as any).toObject() : item;
        return {
            lineId: raw._id.toString(),
            productId: raw.productId.toString(),
            variantId: raw.variantId?.toString(),
            size: raw.size,
            color: raw.color,
            title: raw.title,
            price: raw.price,
            image: getPublicUrl(raw.image),
            quantity: raw.quantity,
            sku: raw.sku,
        };
    }

    async getOrCreateCart(tenantId: string, userId: string): Promise<CartDocument> {
        let cart = await this.cartModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            userId: new Types.ObjectId(userId),
        });

        if (!cart) {
            cart = new this.cartModel({
                tenantId: new Types.ObjectId(tenantId),
                userId: new Types.ObjectId(userId),
                items: [],
            });
            await cart.save();
        }

        return cart;
    }

    async getCart(tenantId: string, userId: string): Promise<CartResponse> {
        const cart = await this.getOrCreateCart(tenantId, userId);
        const items = cart.items.map(item => this.serializeItem(item));
        const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
        return { items, total, itemCount };
    }

    private resolveLineItem(
        product: any,
        variant: ProductVariant | null,
        quantity: number,
        sku?: string,
    ): Partial<CartItem> {
        const price = variant
            ? this.productsService.getVariantPrice(product, variant)
            : product.price;
        const image = toStorageKey(variant?.image || product.images?.[0] || '');
        const titleParts = [product.title];
        if (variant?.size) titleParts.push(`Size ${variant.size}`);
        if (variant?.color) titleParts.push(variant.color);

        return {
            title: titleParts.join(' · '),
            price,
            image,
            quantity,
            size: variant?.size,
            color: variant?.color,
            sku: sku || variant?.sku,
        };
    }

    private async assertCartQuantity(
        tenantId: string,
        productId: string,
        variantId: string | undefined,
        desiredQty: number,
        label: string,
    ): Promise<{ sku?: string }> {
        const snapshot = await this.inventoryService.getStockSnapshot(tenantId, productId, variantId);
        if (!snapshot.trackInventory || snapshot.allowBackorder) {
            return { sku: snapshot.sku };
        }
        if (desiredQty > snapshot.stock) {
            throw new BadRequestException(
                `Only ${Math.max(0, snapshot.stock)} items available for ${label}`,
            );
        }
        return { sku: snapshot.sku };
    }

    async addToCart(tenantId: string, userId: string, addDto: AddToCartDto): Promise<CartResponse> {
        const cart = await this.getOrCreateCart(tenantId, userId);
        const product = await this.productsService.findById(tenantId, addDto.productId);

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        const hasVariants = this.productsService.hasVariants(product);
        let variant: ProductVariant | null = null;
        const variantId = addDto.variantId;

        if (hasVariants) {
            if (!variantId) {
                throw new BadRequestException('Please select a size and color');
            }
            variant = this.productsService.getVariant(product, variantId);
            if (!variant || variant.isActive === false) {
                throw new NotFoundException('Selected variant not found');
            }
            await this.inventoryService.ensureVariantRowsFromProduct(product);
        }

        const existingItem = cart.items.find(
            item => this.matchesCartItem(item, addDto.productId, variantId),
        );
        const newQty = (existingItem?.quantity || 0) + addDto.quantity;
        const { sku } = await this.assertCartQuantity(
            tenantId,
            addDto.productId,
            variantId,
            newQty,
            product.title,
        );

        const existingIndex = cart.items.findIndex(
            item => this.matchesCartItem(item, addDto.productId, variantId),
        );

        if (existingIndex >= 0) {
            cart.items[existingIndex].quantity += addDto.quantity;
        } else {
            const line = this.resolveLineItem(product, variant, addDto.quantity, sku);
            cart.items.push({
                productId: new Types.ObjectId(addDto.productId),
                variantId: variant ? new Types.ObjectId(variantId) : undefined,
                ...line,
            } as CartItem);
        }

        await cart.save();
        return this.getCart(tenantId, userId);
    }

    async updateCartItemByLineId(
        tenantId: string,
        userId: string,
        lineId: string,
        updateDto: UpdateCartItemDto,
    ): Promise<CartResponse> {
        const cart = await this.getOrCreateCart(tenantId, userId);
        const itemIndex = this.findItemIndexByLineId(cart, lineId);

        if (itemIndex < 0) {
            throw new NotFoundException('Item not in cart');
        }

        const cartItem = cart.items[itemIndex];

        if (updateDto.quantity === 0) {
            cart.items.splice(itemIndex, 1);
        } else {
            await this.assertCartQuantity(
                tenantId,
                cartItem.productId.toString(),
                cartItem.variantId?.toString(),
                updateDto.quantity,
                cartItem.title,
            );
            cart.items[itemIndex].quantity = updateDto.quantity;
        }

        await cart.save();
        return this.getCart(tenantId, userId);
    }

    async removeFromCartByLineId(tenantId: string, userId: string, lineId: string): Promise<CartResponse> {
        const cart = await this.getOrCreateCart(tenantId, userId);
        const itemIndex = this.findItemIndexByLineId(cart, lineId);

        if (itemIndex < 0) {
            throw new NotFoundException('Item not in cart');
        }

        cart.items.splice(itemIndex, 1);
        await cart.save();
        return this.getCart(tenantId, userId);
    }

    /** @deprecated Prefer updateCartItemByLineId */
    async updateCartItem(
        tenantId: string,
        userId: string,
        productId: string,
        updateDto: UpdateCartItemDto,
        variantId?: string,
    ): Promise<CartResponse> {
        const cart = await this.getOrCreateCart(tenantId, userId);
        const itemIndex = cart.items.findIndex(
            item => this.matchesCartItem(item, productId, variantId),
        );

        if (itemIndex < 0) {
            throw new NotFoundException('Item not in cart');
        }

        return this.updateCartItemByLineId(
            tenantId,
            userId,
            this.toLineId(cart.items[itemIndex]),
            updateDto,
        );
    }

    /** @deprecated Prefer removeFromCartByLineId */
    async removeFromCart(
        tenantId: string,
        userId: string,
        productId: string,
        variantId?: string,
    ): Promise<CartResponse> {
        const cart = await this.getOrCreateCart(tenantId, userId);
        const itemIndex = cart.items.findIndex(
            item => this.matchesCartItem(item, productId, variantId),
        );

        if (itemIndex < 0) {
            throw new NotFoundException('Item not in cart');
        }

        return this.removeFromCartByLineId(tenantId, userId, this.toLineId(cart.items[itemIndex]));
    }

    async clearCart(tenantId: string, userId: string): Promise<void> {
        await this.cartModel.findOneAndUpdate(
            { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) },
            { items: [] },
        );
    }
}
