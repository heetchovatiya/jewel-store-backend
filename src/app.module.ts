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
import { UploadModule } from './upload/upload.module';
import { PaymentsModule } from './payments/payments.module';
import { resolveMongoUri } from './config/database.config';
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
        }),
        MongooseModule.forRoot(resolveMongoUri()),
        TenantsModule,
        AuthModule,
        UsersModule,
        ProductsModule,
        CartModule,
        OrdersModule,
        LeadsModule,
        StoreConfigModule,
        UploadModule,
        PaymentsModule,
    ],
})

export class AppModule { }
