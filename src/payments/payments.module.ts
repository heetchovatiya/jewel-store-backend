import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { CartModule } from '../cart/cart.module';
import { StoreConfigModule } from '../config/store-config.module';
import { Order, OrderSchema } from '../orders/order.schema';
import { Inventory, InventorySchema } from '../products/inventory.schema';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Order.name, schema: OrderSchema },
            { name: Inventory.name, schema: InventorySchema },
        ]),
        OrdersModule,
        ProductsModule,
        CartModule,
        StoreConfigModule,
        UsersModule,
    ],
    controllers: [PaymentsController],
    providers: [PaymentsService],
})
export class PaymentsModule { }
