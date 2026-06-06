import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Inventory, InventorySchema } from '../products/inventory.schema';
import { Product, ProductSchema } from '../products/product.schema';
import { InventoryService } from './inventory.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Inventory.name, schema: InventorySchema },
            { name: Product.name, schema: ProductSchema },
        ]),
    ],
    providers: [InventoryService],
    exports: [InventoryService],
})
export class InventoryModule { }
