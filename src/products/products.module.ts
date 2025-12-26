import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Product, ProductSchema } from './product.schema';
import { Inventory, InventorySchema } from './inventory.schema';
import { ProductsService } from './products.service';
import { ProductsController, AdminProductsController, AdminInventoryController } from './products.controller';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Product.name, schema: ProductSchema },
            { name: Inventory.name, schema: InventorySchema },
        ]),
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
