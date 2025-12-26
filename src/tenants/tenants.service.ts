import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from './tenant.schema';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantsService {
    constructor(
        @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    ) { }

    async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
        const tenant = new this.tenantModel(createTenantDto);
        return tenant.save();
    }

    async findAll(): Promise<Tenant[]> {
        return this.tenantModel.find().exec();
    }

    async findBySlug(slug: string): Promise<TenantDocument | null> {
        return this.tenantModel.findOne({ slug }).exec();
    }

    async findById(id: string): Promise<TenantDocument | null> {
        return this.tenantModel.findById(id).exec();
    }

    async update(id: string, updateData: Partial<CreateTenantDto>): Promise<Tenant | null> {
        return this.tenantModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    }

    async createDefaultTenant(): Promise<Tenant> {
        const existing = await this.findBySlug('default');
        if (existing) return existing;

        return this.create({
            name: 'Default Store',
            slug: 'default',
            isActive: true,
            ownerEmail: 'admin@jewelcore.com',
        });
    }
}
