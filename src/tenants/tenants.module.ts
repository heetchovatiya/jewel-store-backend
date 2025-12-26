import { Module, MiddlewareConsumer, NestModule, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from './tenant.schema';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantMiddleware } from './tenant.middleware';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Tenant.name, schema: TenantSchema }]),
    ],
    controllers: [TenantsController],
    providers: [TenantsService],
    exports: [TenantsService],
})
export class TenantsModule implements NestModule, OnModuleInit {
    constructor(private readonly tenantsService: TenantsService) { }

    configure(consumer: MiddlewareConsumer) {
        consumer.apply(TenantMiddleware).forRoutes('*');
    }

    async onModuleInit() {
        // Create default tenant on startup
        await this.tenantsService.createDefaultTenant();
    }
}
