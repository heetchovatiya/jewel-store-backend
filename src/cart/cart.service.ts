import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument, CartItem } from './cart.schema';
import { ProductsService } from '../products/products.service';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto';

@Injectable()
export class CartService {
    constructor(
        @InjectModel(Cart.name) private cartModel: Model<CartDocument>,
        private readonly productsService: ProductsService,
    ) { }

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

    async getCart(tenantId: string, userId: string): Promise<{ items: CartItem[]; total: number; itemCount: number }> {
        const cart = await this.getOrCreateCart(tenantId, userId);

        const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

        return {
            items: cart.items,
            total,
            itemCount,
        };
    }

    async addToCart(tenantId: string, userId: string, addDto: AddToCartDto): Promise<Cart> {
        const cart = await this.getOrCreateCart(tenantId, userId);
        const product = await this.productsService.findById(tenantId, addDto.productId);

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        // Check inventory
        const inventory = await this.productsService.getInventory(tenantId, addDto.productId);
        if (inventory && inventory.trackInventory) {
            const existingItem = cart.items.find(
                item => item.productId.toString() === addDto.productId
            );
            const currentQty = existingItem ? existingItem.quantity : 0;

            if (currentQty + addDto.quantity > inventory.stock && !inventory.allowBackorder) {
                throw new BadRequestException(`Only ${inventory.stock - currentQty} items available`);
            }
        }

        // Check if product already in cart
        const existingIndex = cart.items.findIndex(
            item => item.productId.toString() === addDto.productId
        );

        if (existingIndex >= 0) {
            cart.items[existingIndex].quantity += addDto.quantity;
        } else {
            cart.items.push({
                productId: new Types.ObjectId(addDto.productId),
                title: product.title,
                price: product.price,
                image: product.images?.[0] || '',
                quantity: addDto.quantity,
            } as CartItem);
        }

        return cart.save();
    }

    async updateCartItem(tenantId: string, userId: string, productId: string, updateDto: UpdateCartItemDto): Promise<Cart> {
        const cart = await this.getOrCreateCart(tenantId, userId);

        const itemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId
        );

        if (itemIndex < 0) {
            throw new NotFoundException('Item not in cart');
        }

        if (updateDto.quantity === 0) {
            cart.items.splice(itemIndex, 1);
        } else {
            // Check inventory
            const inventory = await this.productsService.getInventory(tenantId, productId);
            if (inventory && inventory.trackInventory) {
                if (updateDto.quantity > inventory.stock && !inventory.allowBackorder) {
                    throw new BadRequestException(`Only ${inventory.stock} items available`);
                }
            }
            cart.items[itemIndex].quantity = updateDto.quantity;
        }

        return cart.save();
    }

    async removeFromCart(tenantId: string, userId: string, productId: string): Promise<Cart> {
        const cart = await this.getOrCreateCart(tenantId, userId);

        cart.items = cart.items.filter(
            item => item.productId.toString() !== productId
        );

        return cart.save();
    }

    async clearCart(tenantId: string, userId: string): Promise<void> {
        await this.cartModel.findOneAndUpdate(
            { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) },
            { items: [] }
        );
    }
}
