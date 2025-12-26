import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoreConfigDocument = StoreConfig & Document;

@Schema({ timestamps: true })
export class StoreConfig {
    @Prop({ required: true, type: Types.ObjectId, unique: true, index: true })
    tenantId: Types.ObjectId;

    @Prop({ required: true })
    storeName: string;

    @Prop()
    storeDescription: string;

    @Prop()
    logoUrl: string;

    @Prop()
    faviconUrl: string;

    @Prop({ default: '#d4af37' })
    primaryColor: string;

    @Prop({ default: '#1a1a2e' })
    secondaryColor: string;

    @Prop({ default: '#0f0f1a' })
    backgroundColor: string;

    @Prop({ default: '#ffffff' })
    textColor: string;

    @Prop({ type: [String], default: [] })
    heroBanners: string[];

    @Prop({
        type: [Object], default: [
            { name: 'Rings', slug: 'rings', showInNavbar: true, order: 0 },
            { name: 'Necklaces', slug: 'necklaces', showInNavbar: true, order: 1 },
            { name: 'Earrings', slug: 'earrings', showInNavbar: true, order: 2 },
            { name: 'Bracelets', slug: 'bracelets', showInNavbar: false, order: 3 },
            { name: 'Pendants', slug: 'pendants', showInNavbar: false, order: 4 },
        ]
    })
    categories: {
        name: string;
        slug: string;
        showInNavbar: boolean;
        order: number;
        image?: string;
    }[];

    // About Us Section
    @Prop({
        type: Object, default: {
            enabled: false,
            title: 'Our Story',
            description: '',
            images: [],
        }
    })
    aboutUs: {
        enabled: boolean;
        title: string;
        description: string;
        images: string[];
    };

    @Prop()
    contactEmail: string;

    @Prop()
    contactPhone: string;

    @Prop()
    address: string;

    @Prop({ type: Object, default: {} })
    socialLinks: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        whatsapp?: string;
    };

    @Prop({ type: Object, default: {} })
    seo: {
        metaTitle?: string;
        metaDescription?: string;
        keywords?: string[];
    };

    @Prop({ default: 'INR' })
    currency: string;

    @Prop({ default: '₹' })
    currencySymbol: string;
}

export const StoreConfigSchema = SchemaFactory.createForClass(StoreConfig);
