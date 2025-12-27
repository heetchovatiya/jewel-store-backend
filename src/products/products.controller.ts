import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    Req, UseGuards, UseInterceptors, UploadedFile
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, UpdateInventoryDto, ProductQueryDto } from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

// Public endpoints
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    findAll(@Req() req: Request, @Query() query: ProductQueryDto) {
        return this.productsService.findAll(req.tenantId!, query);
    }

    @Get('categories')
    getCategories(@Req() req: Request) {
        return this.productsService.getCategories(req.tenantId!);
    }

    @Get('featured')
    getFeatured(@Req() req: Request) {
        return this.productsService.getFeaturedProducts(req.tenantId!);
    }

    @Get(':slug')
    findBySlug(@Req() req: Request, @Param('slug') slug: string) {
        return this.productsService.getProductWithInventory(req.tenantId!, slug);
    }
}

// Admin endpoints
@Controller('admin/products')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    findAll(@Req() req: Request, @Query() query: ProductQueryDto) {
        return this.productsService.findAll(req.tenantId!, { ...query });
    }

    @Get(':id/with-inventory')
    async getWithInventory(@Req() req: Request, @Param('id') id: string) {
        const product = await this.productsService.findById(req.tenantId!, id);
        if (!product) {
            return { error: 'Product not found' };
        }
        const inventory = await this.productsService.getInventory(req.tenantId!, id);
        return {
            ...product.toObject(),
            inventory: inventory || null,
        };
    }

    @Post()
    create(@Req() req: Request, @Body() createProductDto: CreateProductDto) {
        return this.productsService.create(req.tenantId!, createProductDto);
    }

    @Patch(':id')
    update(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() updateProductDto: UpdateProductDto
    ) {
        return this.productsService.update(req.tenantId!, id, updateProductDto);
    }

    @Patch(':id/featured')
    toggleFeatured(@Req() req: Request, @Param('id') id: string) {
        return this.productsService.toggleFeatured(req.tenantId!, id);
    }

    @Delete(':id')
    delete(@Req() req: Request, @Param('id') id: string) {
        return this.productsService.delete(req.tenantId!, id);
    }

    @Post('bulk')
    @UseInterceptors(FileInterceptor('file'))
    async bulkUpload(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
        if (!file) {
            return { error: 'No file uploaded' };
        }
        return this.productsService.bulkUpload(req.tenantId!, file.buffer);
    }
}

// Admin inventory endpoints
@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminInventoryController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    getAllInventory(@Req() req: Request) {
        return this.productsService.getAllInventory(req.tenantId!);
    }

    @Get('low-stock')
    getLowStock(@Req() req: Request) {
        return this.productsService.getLowStockProducts(req.tenantId!);
    }

    @Patch(':productId')
    updateInventory(
        @Req() req: Request,
        @Param('productId') productId: string,
        @Body() updateDto: UpdateInventoryDto
    ) {
        return this.productsService.updateInventory(req.tenantId!, productId, updateDto);
    }
}
