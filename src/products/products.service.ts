import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { Product, ProductDocument } from './product.schema';
import { Inventory } from './inventory.schema';
import { CreateProductDto, UpdateProductDto, UpdateInventoryDto, ProductQueryDto, ProductVariantDto } from './dto/product.dto';
import { ProductVariant } from './product-variant.schema';
import { InventoryService } from '../inventory/inventory.service';
import { expandProductMedia, normalizeProductMedia, toStorageKey } from '../common/media-url';

@Injectable()
export class ProductsService {
    constructor(
        @InjectModel(Product.name) private productModel: Model<ProductDocument>,
        private readonly inventoryService: InventoryService,
    ) { }

    hasVariants(product: { variants?: ProductVariant[] }): boolean {
        return Array.isArray(product.variants) && product.variants.some(v => v.isActive !== false);
    }

    private normalizeVariants(
        variants: ProductVariantDto[] | undefined,
        basePrice: number,
        productId?: string,
    ): ProductVariant[] {
        if (!variants?.length) return [];

        return variants
            .filter(v => (v.size?.trim() || v.color?.trim()))
            .map((v, index) => ({
                ...(v._id ? { _id: new Types.ObjectId(v._id) } : {}),
                size: v.size?.trim() || undefined,
                color: v.color?.trim() || undefined,
                price: v.price ?? basePrice,
                sku: v.sku?.trim() || `SKU-${(productId || 'NEW').slice(-6).toUpperCase()}-${index + 1}`,
                image: v.image?.trim() ? toStorageKey(v.image.trim()) : undefined,
                isActive: v.isActive !== false,
            } as ProductVariant));
    }

    private deriveOptionLists(variants: ProductVariant[]): { availableSizes: string[]; availableColors: string[] } {
        const sizes = new Set<string>();
        const colors = new Set<string>();
        for (const v of variants) {
            if (v.isActive === false) continue;
            if (v.size) sizes.add(v.size);
            if (v.color) colors.add(v.color);
        }
        return {
            availableSizes: Array.from(sizes),
            availableColors: Array.from(colors),
        };
    }

    getVariant(product: ProductDocument | Product, variantId: string): ProductVariant | null {
        const variants = product.variants || [];
        return variants.find(v => (v as any)._id?.toString() === variantId) || null;
    }

    getVariantPrice(product: Product, variant: ProductVariant): number {
        return variant.price ?? product.price;
    }

    private async enrichProduct(tenantId: string, product: ProductDocument | Record<string, unknown>): Promise<any> {
        const obj = (product as ProductDocument).toObject
            ? (product as ProductDocument).toObject()
            : { ...product };
        const hasVariants = this.hasVariants(obj as Product);
        const withStock = await this.inventoryService.attachStockToProduct(
            tenantId,
            obj as Product & { variants?: ProductVariant[]; price: number },
            (p, v) => this.getVariantPrice(p as Product, v),
            hasVariants,
            { migrateVariants: true },
        );
        return expandProductMedia(withStock as Record<string, unknown>);
    }

    private generateSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + Date.now().toString(36);
    }

    async create(tenantId: string, createProductDto: CreateProductDto): Promise<Product> {
        const { sku, stock, lowStockThreshold, variants, availableSizes, availableColors, ...rest } = createProductDto;
        const productData = normalizeProductMedia(rest as Record<string, unknown>) as typeof rest;

        if (!productData.slug) {
            productData.slug = this.generateSlug(productData.title);
        }

        const normalizedVariants = this.normalizeVariants(variants, productData.price);
        const optionLists = normalizedVariants.length
            ? this.deriveOptionLists(normalizedVariants)
            : { availableSizes: availableSizes || [], availableColors: availableColors || [] };

        const product = new this.productModel({
            ...productData,
            variants: normalizedVariants,
            availableSizes: availableSizes?.length ? availableSizes : optionLists.availableSizes,
            availableColors: availableColors?.length ? availableColors : optionLists.availableColors,
            tenantId: new Types.ObjectId(tenantId),
        });

        const savedProduct = await product.save();
        const productId = savedProduct._id.toString();

        const inventoryDefaults = {
            lowStockThreshold: lowStockThreshold || 5,
            trackInventory: true,
            allowBackorder: false,
        };

        if (normalizedVariants.length) {
            await this.inventoryService.syncVariantInventories(
                tenantId,
                productId,
                normalizedVariants.map((v, i) => ({
                    _id: (v as any)._id,
                    sku: v.sku,
                    stock: variants?.[i]?.stock ?? 0,
                    isActive: v.isActive,
                })),
                inventoryDefaults,
            );
        } else {
            await this.inventoryService.createSimpleProductInventory(tenantId, productId, {
                sku,
                stock: stock || 0,
                ...inventoryDefaults,
            });
        }

        return expandProductMedia(savedProduct.toObject() as unknown as Record<string, unknown>) as unknown as Product;
    }

    async findAll(
        tenantId: string,
        query: ProductQueryDto = {},
        options: { includeInactive?: boolean } = {},
    ): Promise<{ products: Product[]; total: number }> {
        const { category, search, featured, page = 1, limit = 20, sort = '-createdAt' } = query;

        const filter: Record<string, unknown> = {
            tenantId: new Types.ObjectId(tenantId),
        };

        if (!options.includeInactive) {
            filter.isActive = true;
        }

        if (category) filter.category = category;
        if (featured !== undefined) filter.isFeatured = featured;
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            this.productModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
            this.productModel.countDocuments(filter),
        ]);

        const productsWithInventory = await Promise.all(
            products.map(async (product) => {
                const obj = product.toObject();
                const hasVariants = this.hasVariants(obj);
                const withStock = await this.inventoryService.attachStockToProduct(
                    tenantId,
                    obj,
                    (p, v) => this.getVariantPrice(p as Product, v),
                    hasVariants,
                    { migrateVariants: false },
                );
                return expandProductMedia(withStock as Record<string, unknown>);
            }),
        );

        return { products: productsWithInventory as any, total };
    }

    async findBySlug(tenantId: string, slug: string): Promise<ProductDocument | null> {
        return this.productModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            slug,
            isActive: true,
        }).exec();
    }

    async findById(tenantId: string, id: string): Promise<ProductDocument | null> {
        return this.productModel.findOne({
            _id: new Types.ObjectId(id),
            tenantId: new Types.ObjectId(tenantId),
        }).exec();
    }

    async update(tenantId: string, id: string, updateDto: UpdateProductDto): Promise<Product | null> {
        const existing = await this.findById(tenantId, id);
        if (!existing) return null;

        const { variants, availableSizes, availableColors, ...rest } = updateDto;
        const updatePayload: Record<string, unknown> = normalizeProductMedia({ ...rest });

        if (variants !== undefined) {
            const basePrice = updateDto.price ?? existing.price;
            const normalizedVariants = this.normalizeVariants(variants, basePrice, id);
            const optionLists = this.deriveOptionLists(normalizedVariants);
            updatePayload.variants = normalizedVariants;
            updatePayload.availableSizes = availableSizes?.length ? availableSizes : optionLists.availableSizes;
            updatePayload.availableColors = availableColors?.length ? availableColors : optionLists.availableColors;

            const existingInv = await this.inventoryService.getProductInventory(tenantId, id);

            await this.inventoryService.syncVariantInventories(
                tenantId,
                id,
                normalizedVariants.map((v, i) => ({
                    _id: (v as any)._id,
                    sku: v.sku,
                    stock: variants[i]?.stock,
                    isActive: v.isActive,
                })),
                {
                    lowStockThreshold: existingInv?.lowStockThreshold ?? 5,
                    trackInventory: existingInv?.trackInventory ?? true,
                    allowBackorder: existingInv?.allowBackorder ?? false,
                },
            );
        } else if (availableSizes !== undefined || availableColors !== undefined) {
            if (availableSizes !== undefined) updatePayload.availableSizes = availableSizes;
            if (availableColors !== undefined) updatePayload.availableColors = availableColors;
        }

        const updated = await this.productModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            updatePayload,
            { new: true },
        ).exec();

        if (!updated) return null;
        return this.enrichProduct(tenantId, updated);
    }

    async delete(tenantId: string, id: string): Promise<void> {
        await this.productModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            { isActive: false },
        ).exec();
    }

    async getCategories(tenantId: string): Promise<string[]> {
        return this.productModel.distinct('category', {
            tenantId: new Types.ObjectId(tenantId),
            isActive: true,
        });
    }

    /** Lightweight list for sitemap generation */
    async findAllSlugsAndDates(
        tenantId: string,
    ): Promise<Array<{ slug: string; updatedAt: Date }>> {
        const rows = await this.productModel
            .find({
                tenantId: new Types.ObjectId(tenantId),
                isActive: true,
            })
            .select({ slug: 1, updatedAt: 1 })
            .lean()
            .exec();

        return rows.map((row: any) => ({
            slug: row.slug as string,
            updatedAt: (row.updatedAt as Date) || new Date(),
        }));
    }

    async getFeaturedProducts(tenantId: string, limit: number = 8): Promise<Product[]> {
        const products = await this.productModel
            .find({
                tenantId: new Types.ObjectId(tenantId),
                isActive: true,
                isFeatured: true,
            })
            .sort('-createdAt')
            .limit(limit)
            .exec();

        return Promise.all(
            products.map(p => this.enrichProduct(tenantId, p)),
        ) as Promise<Product[]>;
    }

    async toggleFeatured(tenantId: string, id: string): Promise<Product | null> {
        const product = await this.findById(tenantId, id);
        if (!product) return null;

        const updated = await this.productModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            { isFeatured: !product.isFeatured },
            { new: true },
        ).exec();

        if (!updated) return null;
        return this.enrichProduct(tenantId, updated);
    }

    async getInventory(tenantId: string, productId: string): Promise<Inventory | null> {
        return this.inventoryService.getProductInventory(tenantId, productId);
    }

    async updateInventory(tenantId: string, productId: string, updateDto: UpdateInventoryDto): Promise<Inventory | null> {
        return this.inventoryService.updateProductInventory(tenantId, productId, updateDto);
    }

    async getLowStockProducts(tenantId: string): Promise<any[]> {
        return this.inventoryService.getLowStockProducts(tenantId);
    }

    async getAllInventory(tenantId: string): Promise<any[]> {
        return this.inventoryService.getAllInventory(tenantId);
    }

    async bulkUpload(tenantId: string, fileBuffer: Buffer): Promise<{ success: number; failed: number; errors: string[] }> {
        return new Promise((resolve) => {
            const results: CreateProductDto[] = [];
            const errors: string[] = [];
            const stream = Readable.from(fileBuffer.toString());

            stream
                .pipe(csvParser())
                .on('data', (row) => {
                    try {
                        const product: CreateProductDto = {
                            title: row.title || row.Title || row.name || row.Name,
                            description: row.description || row.Description || '',
                            price: parseFloat(row.price || row.Price || 0),
                            compareAtPrice: parseFloat(row.compareAtPrice || row.compare_at_price || 0) || undefined,
                            category: row.category || row.Category || 'Uncategorized',
                            images: (row.images || row.Images || row.image || '').split(',').map((s: string) => s.trim()).filter(Boolean),
                            slug: row.slug || row.Slug || undefined,
                            sku: row.sku || row.SKU || undefined,
                            stock: parseInt(row.stock || row.Stock || row.inventory || 0),
                            tags: (row.tags || row.Tags || '').split(',').map((s: string) => s.trim()).filter(Boolean),
                            isFeatured: row.featured === 'true' || row.isFeatured === 'true',
                        };

                        if (product.title && product.price >= 0) {
                            results.push(product);
                        } else {
                            errors.push(`Invalid row: ${JSON.stringify(row).slice(0, 100)}`);
                        }
                    } catch (e) {
                        errors.push(`Parse error: ${e.message}`);
                    }
                })
                .on('end', async () => {
                    let success = 0;
                    for (const productData of results) {
                        try {
                            await this.create(tenantId, productData);
                            success++;
                        } catch (e) {
                            errors.push(`Failed to create "${productData.title}": ${e.message}`);
                        }
                    }
                    resolve({
                        success,
                        failed: results.length - success + errors.length,
                        errors: errors.slice(0, 10),
                    });
                })
                .on('error', (e) => {
                    errors.push(`CSV parse error: ${e.message}`);
                    resolve({ success: 0, failed: 1, errors });
                });
        });
    }

    async getProductWithInventory(tenantId: string, slug: string): Promise<any> {
        const product = await this.findBySlug(tenantId, slug);
        if (!product) return null;
        return this.enrichProduct(tenantId, product);
    }

    async getProductWithInventoryById(tenantId: string, id: string): Promise<any> {
        const product = await this.findById(tenantId, id);
        if (!product) return null;
        return this.enrichProduct(tenantId, product);
    }
}
