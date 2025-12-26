import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lead, LeadSchema } from './lead.schema';
import { LeadsService } from './leads.service';
import { LeadsController, AdminLeadsController } from './leads.controller';
import { ProductsModule } from '../products/products.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Lead.name, schema: LeadSchema }]),
        ProductsModule,
    ],
    controllers: [LeadsController, AdminLeadsController],
    providers: [LeadsService],
    exports: [LeadsService],
})
export class LeadsModule { }
