import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Inventory, InventoryDocument } from '../products/inventory.schema';
import { Product, ProductDocument } from '../products/product.schema';
import { ProductVariant } from '../products/product-variant.schema';
import { UpdateInventoryDto } from '../products/dto/product.dto';

export interface InventoryDefaults {
    sku?: string;
    stock?: number;
    lowStockThreshold?: number;
    trackInventory?: boolean;
    allowBackorder?: boolean;
}

export interface VariantInventoryInput {
    _id?: Types.ObjectId | string;
    size?: string;
    color?: string;
    sku?: string;
    stock?: number;
    isActive?: boolean;
}

export interface StockSnapshot {
    stock: number;
    sku?: string;
    inStock: boolean;
    trackInventory: boolean;
    allowBackorder: boolean;
}

@Injectable()
export class InventoryService implements OnModuleInit {
    private readonly logger = new Logger(InventoryService.name);

    constructor(
        @InjectModel(Inventory.name) private readonly inventoryModel: Model<InventoryDocument>,
        @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    ) { }

    async onModuleInit(): Promise<void> {
        await this.migrateInventoryIndexes();
    }

    /** Drops legacy (tenantId, productId) unique index so per-variant rows can exist. */
    private async migrateInventoryIndexes(): Promise<void> {
        try {
            const collection = this.inventoryModel.collection;
            const indexes = await collection.indexes();
            const hasLegacy = indexes.some(
                (idx) => idx.name === 'tenantId_1_productId_1',
            );
            if (hasLegacy) {
                await collection.dropIndex('tenantId_1_productId_1');
                this.logger.log('Dropped legacy index inventories.tenantId_1_productId_1');
            }
            await this.inventoryModel.syncIndexes();
        } catch (err) {
            this.logger.warn(`Inventory index migration: ${(err as Error).message}`);
        }
    }

    private tenantId(tenantId: string) {
        return new Types.ObjectId(tenantId);
    }

    private productId(productId: string) {
        return new Types.ObjectId(productId);
    }

    private variantId(variantId: string) {
        return new Types.ObjectId(variantId);
    }

    private variantFilter(variantId?: string | null) {
        if (variantId) {
            return { variantId: this.variantId(variantId) };
        }
        return { $or: [{ variantId: null }, { variantId: { $exists: false } }] };
    }

    async getRow(
        tenantId: string,
        productId: string,
        variantId?: string | null,
    ): Promise<InventoryDocument | null> {
        return this.inventoryModel.findOne({
            tenantId: this.tenantId(tenantId),
            productId: this.productId(productId),
            ...this.variantFilter(variantId ?? null),
        }).exec();
    }

    /** Simple-product inventory row (variantId null) — backward compatible */
    async getProductInventory(tenantId: string, productId: string): Promise<Inventory | null> {
        return this.getRow(tenantId, productId, null);
    }

    async listForProduct(tenantId: string, productId: string): Promise<InventoryDocument[]> {
        return this.inventoryModel.find({
            tenantId: this.tenantId(tenantId),
            productId: this.productId(productId),
        }).exec();
    }

    async listForProducts(tenantId: string, productIds: string[]): Promise<InventoryDocument[]> {
        if (!productIds.length) return [];
        return this.inventoryModel.find({
            tenantId: this.tenantId(tenantId),
            productId: { $in: productIds.map(id => this.productId(id)) },
        }).exec();
    }

    async getStockSnapshot(
        tenantId: string,
        productId: string,
        variantId?: string,
    ): Promise<StockSnapshot> {
        const row = await this.getRow(tenantId, productId, variantId ?? null);
        if (!row) {
            return { stock: 0, inStock: false, trackInventory: true, allowBackorder: false };
        }
        return {
            stock: row.stock,
            sku: row.sku,
            inStock: row.stock > 0 || row.allowBackorder,
            trackInventory: row.trackInventory,
            allowBackorder: row.allowBackorder,
        };
    }

    async assertAvailable(
        tenantId: string,
        productId: string,
        variantId: string | undefined,
        quantity: number,
        label?: string,
    ): Promise<StockSnapshot> {
        const snapshot = await this.getStockSnapshot(tenantId, productId, variantId);
        if (!snapshot.trackInventory || snapshot.allowBackorder) {
            return snapshot;
        }
        if (quantity > snapshot.stock) {
            const name = label || 'item';
            throw new BadRequestException(
                `Not enough stock for "${name}". Available: ${snapshot.stock}`,
            );
        }
        return snapshot;
    }

    async decrement(
        tenantId: string,
        productId: string,
        variantId: string | undefined,
        quantity: number,
        label?: string,
    ): Promise<void> {
        const snapshot = await this.getStockSnapshot(tenantId, productId, variantId);
        if (!snapshot.trackInventory) return;
        if (snapshot.allowBackorder) {
            await this.inventoryModel.updateOne(
                {
                    tenantId: this.tenantId(tenantId),
                    productId: this.productId(productId),
                    ...this.variantFilter(variantId ?? null),
                },
                { $inc: { stock: -quantity } },
            );
            return;
        }

        const updated = await this.inventoryModel.findOneAndUpdate(
            {
                tenantId: this.tenantId(tenantId),
                productId: this.productId(productId),
                ...this.variantFilter(variantId ?? null),
                stock: { $gte: quantity },
            },
            { $inc: { stock: -quantity } },
            { new: true },
        ).exec();

        if (!updated) {
            throw new BadRequestException(
                `Insufficient stock during fulfillment for ${label || 'item'}`,
            );
        }
    }

    async increment(
        tenantId: string,
        productId: string,
        variantId: string | undefined,
        quantity: number,
    ): Promise<void> {
        await this.inventoryModel.updateOne(
            {
                tenantId: this.tenantId(tenantId),
                productId: this.productId(productId),
                ...this.variantFilter(variantId ?? null),
            },
            { $inc: { stock: quantity } },
        );
    }

    async createSimpleProductInventory(
        tenantId: string,
        productId: string,
        defaults: InventoryDefaults = {},
    ): Promise<InventoryDocument> {
        return this.inventoryModel.create({
            tenantId: this.tenantId(tenantId),
            productId: this.productId(productId),
            variantId: null,
            sku: defaults.sku || `SKU-${productId.slice(-8).toUpperCase()}`,
            stock: defaults.stock ?? 0,
            lowStockThreshold: defaults.lowStockThreshold ?? 5,
            trackInventory: defaults.trackInventory ?? true,
            allowBackorder: defaults.allowBackorder ?? false,
        });
    }

    async syncVariantInventories(
        tenantId: string,
        productId: string,
        variants: VariantInventoryInput[],
        defaults: InventoryDefaults = {},
    ): Promise<void> {
        const tId = this.tenantId(tenantId);
        const pId = this.productId(productId);
        const activeVariantIds = new Set<string>();

        for (const variant of variants) {
            if (variant.isActive === false || !variant._id) continue;
            const vid = variant._id.toString();
            activeVariantIds.add(vid);

            const existing = await this.getRow(tenantId, productId, vid);
            const stock = variant.stock !== undefined
                ? variant.stock
                : (existing?.stock ?? 0);

            await this.inventoryModel.findOneAndUpdate(
                { tenantId: tId, productId: pId, variantId: this.variantId(vid) },
                {
                    $set: {
                        sku: variant.sku?.trim() || existing?.sku || `SKU-${productId.slice(-6).toUpperCase()}-${vid.slice(-4)}`,
                        stock,
                        lowStockThreshold: defaults.lowStockThreshold ?? existing?.lowStockThreshold ?? 5,
                        trackInventory: defaults.trackInventory ?? existing?.trackInventory ?? true,
                        allowBackorder: defaults.allowBackorder ?? existing?.allowBackorder ?? false,
                    },
                },
                { upsert: true, new: true },
            );
        }

        const existing = await this.listForProduct(tenantId, productId);
        for (const row of existing) {
            const vid = row.variantId?.toString();
            if (!vid) {
                // Remove legacy aggregate row when product uses per-variant stock
                if (activeVariantIds.size > 0) {
                    await this.inventoryModel.deleteOne({ _id: row._id });
                }
                continue;
            }
            if (!activeVariantIds.has(vid)) {
                await this.inventoryModel.deleteOne({ _id: row._id });
            }
        }
    }

    async updateProductInventory(
        tenantId: string,
        productId: string,
        updateDto: UpdateInventoryDto,
    ): Promise<Inventory | null> {
        return this.inventoryModel.findOneAndUpdate(
            {
                tenantId: this.tenantId(tenantId),
                productId: this.productId(productId),
                ...this.variantFilter(null),
            },
            updateDto,
            { new: true, upsert: true },
        ).exec();
    }

    /**
     * Migrate embedded variant.stock → Inventory rows (one-time lazy path).
     */
    async ensureVariantRowsFromProduct(product: ProductDocument): Promise<void> {
        const variants = product.variants || [];
        if (!variants.length) return;

        const tenantId = product.tenantId.toString();
        const productId = product._id.toString();

        for (const variant of variants) {
            const vid = (variant as any)._id?.toString();
            if (!vid || variant.isActive === false) continue;

            const existing = await this.getRow(tenantId, productId, vid);
            if (existing) continue;

            const embeddedStock = (variant as any).stock;
            try {
                await this.inventoryModel.findOneAndUpdate(
                    {
                        tenantId: product.tenantId,
                        productId: product._id,
                        variantId: new Types.ObjectId(vid),
                    },
                    {
                        $setOnInsert: {
                            sku: variant.sku || `SKU-${productId.slice(-6).toUpperCase()}-${vid.slice(-4)}`,
                            stock: typeof embeddedStock === 'number' ? embeddedStock : 0,
                            lowStockThreshold: 5,
                            trackInventory: true,
                            allowBackorder: false,
                        },
                    },
                    { upsert: true },
                );
            } catch (err) {
                if ((err as { code?: number }).code !== 11000) {
                    throw err;
                }
                this.logger.warn(
                    `Skipped variant inventory row for product ${productId} — run index migration if this persists`,
                );
            }
        }

        const aggregate = await this.getRow(tenantId, productId, null);
        if (aggregate) {
            await this.inventoryModel.deleteOne({ _id: aggregate._id });
        }
    }

    async attachStockToProduct(
        tenantId: string,
        product: any,
        getVariantPrice: (product: any, variant: ProductVariant) => number,
        hasVariants: boolean,
        options: { migrateVariants?: boolean } = {},
    ): Promise<any> {
        const productId = (product as any)._id?.toString();
        if (!productId) {
            return { ...product, hasVariants: false, inventory: { stock: 0, inStock: false } };
        }

        if (options.migrateVariants && hasVariants) {
            const doc = await this.productModel.findById(productId).exec();
            if (doc) {
                await this.ensureVariantRowsFromProduct(doc);
            }
        }

        const rows = await this.listForProduct(tenantId, productId);
        const settingsRow = rows.find(r => !r.variantId);
        const allowBackorder = settingsRow?.allowBackorder
            || rows.some(r => r.allowBackorder);

        if (hasVariants && product.variants?.length) {
            const stockByVariant = new Map<string, InventoryDocument>();
            for (const row of rows) {
                if (row.variantId) {
                    stockByVariant.set(row.variantId.toString(), row);
                }
            }

            const variantsWithStock = product.variants.map((v) => {
                const vid = (v as any)._id?.toString();
                const row = vid ? stockByVariant.get(vid) : undefined;
                return {
                    ...(typeof (v as any).toObject === 'function' ? (v as any).toObject() : v),
                    stock: row?.stock ?? 0,
                    sku: row?.sku ?? v.sku,
                };
            });

            const active = variantsWithStock.filter(v => v.isActive !== false);
            const totalStock = active.reduce((sum, v) => sum + (v.stock || 0), 0);
            const prices = active.map(v => getVariantPrice(product, v as ProductVariant));
            const minPrice = prices.length ? Math.min(...prices) : product.price;
            const maxPrice = prices.length ? Math.max(...prices) : product.price;

            return {
                ...product,
                variants: variantsWithStock,
                hasVariants: true,
                inventory: {
                    stock: totalStock,
                    inStock: totalStock > 0 || allowBackorder,
                    priceFrom: minPrice,
                    priceTo: maxPrice,
                    allowBackorder,
                },
            };
        }

        const simpleRow = rows.find(r => !r.variantId) || rows[0];
        return {
            ...product,
            hasVariants: false,
            inventory: simpleRow ? {
                stock: simpleRow.stock,
                sku: simpleRow.sku,
                inStock: simpleRow.stock > 0 || simpleRow.allowBackorder,
                allowBackorder: simpleRow.allowBackorder,
            } : { stock: 0, inStock: false },
        };
    }

    async getLowStockProducts(tenantId: string): Promise<any[]> {
        return this.inventoryModel.aggregate([
            { $match: { tenantId: this.tenantId(tenantId) } },
            { $match: { $expr: { $lte: ['$stock', '$lowStockThreshold'] } } },
            { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $match: { 'product.isActive': true } },
        ]).exec();
    }

    async getAllInventory(tenantId: string): Promise<any[]> {
        return this.inventoryModel.aggregate([
            { $match: { tenantId: this.tenantId(tenantId) } },
            { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $match: { 'product.isActive': true } },
        ]).exec();
    }
}
