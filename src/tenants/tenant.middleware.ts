import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Fixed tenant ID for single-store mode
// This is a MongoDB ObjectId string - will be auto-created on first request
const DEFAULT_TENANT_ID = '000000000000000000000001';

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
    async use(req: Request, res: Response, next: NextFunction) {
        // Single-store mode: always use the default tenant
        req.tenantId = DEFAULT_TENANT_ID;
        req.tenantSlug = 'default';
        next();
    }
}

