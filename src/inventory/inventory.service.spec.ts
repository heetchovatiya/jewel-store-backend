import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
    const tenantId = new Types.ObjectId().toString();
    const productId = new Types.ObjectId().toString();

    let inventoryModel: {
        findOne: jest.Mock;
        find: jest.Mock;
        findOneAndUpdate: jest.Mock;
        updateOne: jest.Mock;
        create: jest.Mock;
        deleteOne: jest.Mock;
    };
    let productModel: { findById: jest.Mock };
    let service: InventoryService;

    beforeEach(() => {
        inventoryModel = {
            findOne: jest.fn(),
            find: jest.fn(),
            findOneAndUpdate: jest.fn(),
            updateOne: jest.fn(),
            create: jest.fn(),
            deleteOne: jest.fn(),
        };
        productModel = { findById: jest.fn() };
        service = new InventoryService(inventoryModel as any, productModel as any);
    });

    describe('assertAvailable', () => {
        it('allows when stock is sufficient', async () => {
            inventoryModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                    stock: 5,
                    trackInventory: true,
                    allowBackorder: false,
                    sku: 'SKU-1',
                }),
            });

            const result = await service.assertAvailable(tenantId, productId, undefined, 2);
            expect(result.stock).toBe(5);
        });

        it('throws when stock is insufficient', async () => {
            inventoryModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                    stock: 1,
                    trackInventory: true,
                    allowBackorder: false,
                }),
            });

            await expect(
                service.assertAvailable(tenantId, productId, undefined, 3, 'Gold Ring'),
            ).rejects.toThrow(BadRequestException);
        });

        it('skips check when backorder is allowed', async () => {
            inventoryModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                    stock: 0,
                    trackInventory: true,
                    allowBackorder: true,
                }),
            });

            await expect(
                service.assertAvailable(tenantId, productId, undefined, 99),
            ).resolves.toBeDefined();
        });
    });

    describe('decrement', () => {
        it('atomically decrements when stock is available', async () => {
            inventoryModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                    stock: 3,
                    trackInventory: true,
                    allowBackorder: false,
                }),
            });
            inventoryModel.findOneAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue({ stock: 2 }),
            });

            await service.decrement(tenantId, productId, undefined, 1);
            expect(inventoryModel.findOneAndUpdate).toHaveBeenCalled();
        });

        it('throws when atomic decrement fails', async () => {
            inventoryModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                    stock: 1,
                    trackInventory: true,
                    allowBackorder: false,
                }),
            });
            inventoryModel.findOneAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            });

            await expect(
                service.decrement(tenantId, productId, undefined, 5, 'Bangle'),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
