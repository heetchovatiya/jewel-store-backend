import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Product, ProductSchema } from './product.schema';
import { ProductsService } from './products.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsController, AdminProductsController, AdminInventoryController } from './products.controller';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
        InventoryModule,
        MulterModule.register({
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB limit
            },
        }),
    ],
    controllers: [ProductsController, AdminProductsController, AdminInventoryController],
    providers: [ProductsService],
    exports: [ProductsService],
})
export class ProductsModule { }
