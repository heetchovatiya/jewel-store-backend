import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoreConfig, StoreConfigSchema } from './store-config.schema';
import { StoreConfigService } from './store-config.service';
import { StoreConfigController, AdminStoreConfigController } from './store-config.controller';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: StoreConfig.name, schema: StoreConfigSchema }]),
    ],
    controllers: [StoreConfigController, AdminStoreConfigController],
    providers: [StoreConfigService],
    exports: [StoreConfigService],
})
export class StoreConfigModule { }
