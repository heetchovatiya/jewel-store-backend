import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { Product, ProductDocument } from './product.schema';
import { Inventory, InventoryDocument } from './inventory.schema';
import { CreateProductDto, UpdateProductDto, UpdateInventoryDto, ProductQueryDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
    constructor(
        @InjectModel(Product.name) private productModel: Model<ProductDocument>,
        @InjectModel(Inventory.name) private inventoryModel: Model<InventoryDocument>,
    ) { }

    // Generate slug from title
    private generateSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            + '-' + Date.now().toString(36);
    }

    async create(tenantId: string, createProductDto: CreateProductDto): Promise<Product> {
        const { sku, stock, lowStockThreshold, ...productData } = createProductDto;

        // Generate slug if not provided
        if (!productData.slug) {
            productData.slug = this.generateSlug(productData.title);
        }

        const product = new this.productModel({
            ...productData,
            tenantId: new Types.ObjectId(tenantId),
        });

        const savedProduct = await product.save();

        // Create inventory record
        await this.inventoryModel.create({
            tenantId: new Types.ObjectId(tenantId),
            productId: savedProduct._id,
            sku: sku || `SKU-${savedProduct._id.toString().slice(-8).toUpperCase()}`,
            stock: stock || 0,
            lowStockThreshold: lowStockThreshold || 5,
        });

        return savedProduct;
    }

    async findAll(tenantId: string, query: ProductQueryDto = {}): Promise<{ products: Product[]; total: number }> {
        const { category, search, featured, page = 1, limit = 20, sort = '-createdAt' } = query;

        const filter: any = {
            tenantId: new Types.ObjectId(tenantId),
            isActive: true,
        };

        if (category) {
            filter.category = category;
        }

        if (featured !== undefined) {
            filter.isFeatured = featured;
        }

        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            this.productModel
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .exec(),
            this.productModel.countDocuments(filter),
        ]);

        return { products, total };
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
        return this.productModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            updateDto,
            { new: true }
        ).exec();
    }

    async delete(tenantId: string, id: string): Promise<void> {
        await this.productModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            { isActive: false }
        ).exec();
    }

    async getCategories(tenantId: string): Promise<string[]> {
        const categories = await this.productModel.distinct('category', {
            tenantId: new Types.ObjectId(tenantId),
            isActive: true,
        });
        return categories;
    }

    // Get featured products
    async getFeaturedProducts(tenantId: string, limit: number = 8): Promise<Product[]> {
        return this.productModel
            .find({
                tenantId: new Types.ObjectId(tenantId),
                isActive: true,
                isFeatured: true,
            })
            .sort('-createdAt')
            .limit(limit)
            .exec();
    }

    // Toggle featured status
    async toggleFeatured(tenantId: string, id: string): Promise<Product | null> {
        const product = await this.findById(tenantId, id);
        if (!product) return null;

        return this.productModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            { isFeatured: !product.isFeatured },
            { new: true }
        ).exec();
    }

    // Inventory methods
    async getInventory(tenantId: string, productId: string): Promise<Inventory | null> {
        return this.inventoryModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            productId: new Types.ObjectId(productId),
        }).exec();
    }

    async updateInventory(tenantId: string, productId: string, updateDto: UpdateInventoryDto): Promise<Inventory | null> {
        return this.inventoryModel.findOneAndUpdate(
            { tenantId: new Types.ObjectId(tenantId), productId: new Types.ObjectId(productId) },
            updateDto,
            { new: true }
        ).exec();
    }

    async getLowStockProducts(tenantId: string): Promise<any[]> {
        return this.inventoryModel.aggregate([
            { $match: { tenantId: new Types.ObjectId(tenantId) } },
            { $match: { $expr: { $lte: ['$stock', '$lowStockThreshold'] } } },
            { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $match: { 'product.isActive': true } },
        ]).exec();
    }

    async getAllInventory(tenantId: string): Promise<any[]> {
        return this.inventoryModel.aggregate([
            { $match: { tenantId: new Types.ObjectId(tenantId) } },
            { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $match: { 'product.isActive': true } },
        ]).exec();
    }

    // Bulk upload from CSV
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
                        errors: errors.slice(0, 10), // Return first 10 errors
                    });
                })
                .on('error', (e) => {
                    errors.push(`CSV parse error: ${e.message}`);
                    resolve({ success: 0, failed: 1, errors });
                });
        });
    }

    // Get product with inventory
    async getProductWithInventory(tenantId: string, slug: string): Promise<any> {
        const product = await this.findBySlug(tenantId, slug);
        if (!product) return null;

        const inventory = await this.getInventory(tenantId, product._id.toString());

        return {
            ...product.toObject(),
            inventory: inventory ? {
                stock: inventory.stock,
                sku: inventory.sku,
                inStock: inventory.stock > 0 || inventory.allowBackorder,
            } : null,
        };
    }
}
