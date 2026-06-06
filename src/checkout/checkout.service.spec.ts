import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
    const tenantId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const productId = new Types.ObjectId().toString();

    let cartService: { getCart: jest.Mock };
    let productsService: {
        findById: jest.Mock;
        hasVariants: jest.Mock;
        getVariant: jest.Mock;
    };
    let inventoryService: { assertAvailable: jest.Mock; decrement: jest.Mock };
    let service: CheckoutService;

    beforeEach(() => {
        cartService = { getCart: jest.fn() };
        productsService = {
            findById: jest.fn(),
            hasVariants: jest.fn(),
            getVariant: jest.fn(),
        };
        inventoryService = {
            assertAvailable: jest.fn().mockResolvedValue({ sku: 'SKU-1', stock: 5 }),
            decrement: jest.fn(),
        };
        service = new CheckoutService(
            cartService as any,
            productsService as any,
            inventoryService as any,
        );
    });

    it('builds order from cart using cart line prices', async () => {
        cartService.getCart.mockResolvedValue({
            items: [
                {
                    lineId: 'line1',
                    productId,
                    title: 'Gold Chain',
                    price: 45000,
                    image: '/img.jpg',
                    quantity: 2,
                },
            ],
            total: 90000,
            itemCount: 2,
        });

        productsService.findById.mockResolvedValue({
            _id: productId,
            title: 'Gold Chain',
            isActive: true,
            price: 40000,
            variants: [],
        });
        productsService.hasVariants.mockReturnValue(false);

        const result = await service.buildFromCart(tenantId, userId);

        expect(result.subtotal).toBe(90000);
        expect(result.orderItems[0].price).toBe(45000);
        expect(result.orderItems[0].quantity).toBe(2);
        expect(inventoryService.assertAvailable).toHaveBeenCalledWith(
            tenantId,
            productId,
            undefined,
            2,
            'Gold Chain',
        );
    });

    it('rejects when cart is empty', async () => {
        cartService.getCart.mockResolvedValue({ items: [], total: 0, itemCount: 0 });
        await expect(service.buildFromCart(tenantId, userId)).rejects.toThrow(BadRequestException);
    });

    it('fulfills inventory for each order line', async () => {
        const variantId = new Types.ObjectId();
        await service.fulfillInventory(tenantId, [
            {
                productId: new Types.ObjectId(productId),
                variantId,
                title: 'Ring',
                price: 100,
                quantity: 1,
            } as any,
        ]);

        expect(inventoryService.decrement).toHaveBeenCalledWith(
            tenantId,
            productId,
            variantId.toString(),
            1,
            'Ring',
        );
    });
});
