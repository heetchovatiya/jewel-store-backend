import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantsModule } from './tenants/tenants.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { LeadsModule } from './leads/leads.module';
import { StoreConfigModule } from './config/store-config.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/jewelcore'),
        TenantsModule,
        AuthModule,
        UsersModule,
        ProductsModule,
        CartModule,
        OrdersModule,
        LeadsModule,
        StoreConfigModule,
    ],
})
export class AppModule { }
