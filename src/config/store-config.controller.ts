import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { StoreConfigService } from './store-config.service';
import { UpdateStoreConfigDto } from './dto/store-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

// Public config endpoint
@Controller('config')
export class StoreConfigController {
    constructor(private readonly configService: StoreConfigService) { }

    @Get()
    getPublicConfig(@Req() req: Request) {
        return this.configService.getPublicConfig(req.tenantId!);
    }
}

// Admin config endpoint
@Controller('admin/config')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminStoreConfigController {
    constructor(private readonly configService: StoreConfigService) { }

    @Get()
    getConfig(@Req() req: Request) {
        return this.configService.getOrCreate(req.tenantId!);
    }

    @Patch()
    updateConfig(@Req() req: Request, @Body() updateDto: UpdateStoreConfigDto) {
        return this.configService.update(req.tenantId!, updateDto);
    }
}
