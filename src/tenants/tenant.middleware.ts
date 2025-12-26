import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantsService } from './tenants.service';

// Extend Express Request to include tenant info
declare global {
    namespace Express {
        interface Request {
            tenantId?: string;
            tenantSlug?: string;
        }
    }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
    constructor(private readonly tenantsService: TenantsService) { }

    async use(req: Request, res: Response, next: NextFunction) {
        // Try to get tenant from header first
        let tenantSlug = req.headers['x-tenant-id'] as string;

        // Fallback: extract from subdomain
        if (!tenantSlug) {
            const host = req.headers.host || '';
            const subdomain = host.split('.')[0];
            if (subdomain && subdomain !== 'localhost' && subdomain !== 'www') {
                tenantSlug = subdomain;
            }
        }

        // If still no tenant, use default for public routes
        if (!tenantSlug) {
            tenantSlug = 'default';
        }

        try {
            const tenant = await this.tenantsService.findBySlug(tenantSlug);
            if (tenant && tenant.isActive) {
                req.tenantId = tenant._id.toString();
                req.tenantSlug = tenant.slug;
            } else if (tenantSlug !== 'default') {
                throw new BadRequestException('Invalid or inactive tenant');
            }
        } catch (error) {
            // For default tenant or first-time setup, allow request to continue
            if (tenantSlug === 'default') {
                req.tenantSlug = 'default';
            } else {
                throw error;
            }
        }

        next();
    }
}
