import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StoreConfig, StoreConfigDocument } from './store-config.schema';
import { UpdateStoreConfigDto } from './dto/store-config.dto';

const DEFAULT_CATEGORIES = [
    { name: 'Rings', slug: 'rings', showInNavbar: true, order: 0 },
    { name: 'Necklaces', slug: 'necklaces', showInNavbar: true, order: 1 },
    { name: 'Earrings', slug: 'earrings', showInNavbar: true, order: 2 },
    { name: 'Bracelets', slug: 'bracelets', showInNavbar: false, order: 3 },
    { name: 'Pendants', slug: 'pendants', showInNavbar: false, order: 4 },
];

@Injectable()
export class StoreConfigService {
    constructor(
        @InjectModel(StoreConfig.name) private configModel: Model<StoreConfigDocument>,
    ) { }

    async getOrCreate(tenantId: string): Promise<StoreConfig> {
        let config = await this.configModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
        });

        if (!config) {
            config = new this.configModel({
                tenantId: new Types.ObjectId(tenantId),
                storeName: 'My Jewelry Store',
                storeDescription: 'Exquisite jewelry for every occasion',
                primaryColor: '#d4af37',
                secondaryColor: '#1a1a2e',
                backgroundColor: '#0f0f1a',
                textColor: '#ffffff',
                currency: 'INR',
                currencySymbol: '₹',
                categories: DEFAULT_CATEGORIES,
            });
            await config.save();
        }

        // Ensure categories exist even for existing configs without them
        if (!config.categories || config.categories.length === 0) {
            config.categories = DEFAULT_CATEGORIES;
            await config.save();
        }

        return config;
    }

    async getPublicConfig(tenantId: string): Promise<Partial<StoreConfig>> {
        const config = await this.getOrCreate(tenantId);

        // Return only public-facing config including categories and aboutUs
        return {
            storeName: config.storeName,
            storeDescription: config.storeDescription,
            logoUrl: config.logoUrl,
            faviconUrl: config.faviconUrl,
            primaryColor: config.primaryColor,
            secondaryColor: config.secondaryColor,
            backgroundColor: config.backgroundColor,
            textColor: config.textColor,
            heroBanners: config.heroBanners,
            categories: config.categories || DEFAULT_CATEGORIES,
            aboutUs: config.aboutUs || { enabled: false, title: 'Our Story', description: '', images: [] },
            contactEmail: config.contactEmail,
            contactPhone: config.contactPhone,
            address: config.address,
            socialLinks: config.socialLinks,
            seo: config.seo,
            currency: config.currency,
            currencySymbol: config.currencySymbol,
        };
    }

    async update(tenantId: string, updateDto: UpdateStoreConfigDto): Promise<StoreConfig> {
        await this.getOrCreate(tenantId); // Ensure exists

        return this.configModel.findOneAndUpdate(
            { tenantId: new Types.ObjectId(tenantId) },
            updateDto,
            { new: true }
        ).exec();
    }
}
