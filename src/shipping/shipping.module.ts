import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/order.schema';
import { BluedartClient } from './bluedart.client';
import { ShippingService } from './shipping.service';
import { AdminShippingController, ShippingController } from './shipping.controller';

@Module({
    imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])],
    controllers: [ShippingController, AdminShippingController],
    providers: [BluedartClient, ShippingService],
    exports: [ShippingService],
})
export class ShippingModule { }
