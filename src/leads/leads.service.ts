import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument, LeadStatus } from './lead.schema';
import { ProductsService } from '../products/products.service';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto } from './dto/lead.dto';

@Injectable()
export class LeadsService {
    constructor(
        @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
        private readonly productsService: ProductsService,
    ) { }

    async create(tenantId: string, createDto: CreateLeadDto): Promise<Lead> {
        let productTitle = '';

        if (createDto.productId) {
            const product = await this.productsService.findById(tenantId, createDto.productId);
            if (product) {
                productTitle = product.title;
            }
        }

        const lead = new this.leadModel({
            tenantId: new Types.ObjectId(tenantId),
            customerName: createDto.customerName,
            customerPhone: createDto.customerPhone,
            customerEmail: createDto.customerEmail,
            productId: createDto.productId ? new Types.ObjectId(createDto.productId) : undefined,
            productTitle,
            source: createDto.source || 'website',
            status: LeadStatus.PENDING,
        });

        return lead.save();
    }

    async findAll(tenantId: string, query: LeadQueryDto = {}): Promise<{ leads: Lead[]; total: number }> {
        const { status, page = 1, limit = 20 } = query;

        const filter: any = {
            tenantId: new Types.ObjectId(tenantId),
        };

        if (status) {
            filter.status = status;
        }

        const skip = (page - 1) * limit;

        const [leads, total] = await Promise.all([
            this.leadModel
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.leadModel.countDocuments(filter),
        ]);

        return { leads, total };
    }

    async findById(tenantId: string, id: string): Promise<Lead | null> {
        return this.leadModel.findOne({
            _id: new Types.ObjectId(id),
            tenantId: new Types.ObjectId(tenantId),
        }).exec();
    }

    async update(tenantId: string, id: string, updateDto: UpdateLeadDto): Promise<Lead | null> {
        return this.leadModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            updateDto,
            { new: true }
        ).exec();
    }

    async getNewLeadsCount(tenantId: string): Promise<number> {
        return this.leadModel.countDocuments({
            tenantId: new Types.ObjectId(tenantId),
            status: LeadStatus.PENDING,
        });
    }
}
