import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ShippingService } from './shipping.service';
import { CreateWaybillDto, ServiceabilityQueryDto } from './dto/shipping.dto';

/** Public + customer endpoints. */
@Controller('shipping')
export class ShippingController {
    constructor(private readonly shippingService: ShippingService) { }

    /** GET /shipping/serviceability?pincode=400057 (no login needed) */
    @Get('serviceability')
    async serviceability(@Query() query: ServiceabilityQueryDto, @Res({ passthrough: true }) res: Response) {
        res.setHeader('Cache-Control', 'public, max-age=600');
        const r = await this.shippingService.checkServiceability(query.pincode);
        // Only what the storefront needs
        return {
            pincode: r.pincode,
            checked: r.checked,
            serviceable: r.serviceable,
            prepaidAvailable: r.prepaidAvailable,
            codAvailable: r.codAvailable,
            estimatedDeliveryDate: r.estimatedDeliveryDate,
            message: r.message,
        };
    }

    /** GET /shipping/orders/:id/tracking — the logged-in customer's own order */
    @Get('orders/:id/tracking')
    @UseGuards(JwtAuthGuard)
    tracking(@Req() req: Request, @Param('id') id: string) {
        return this.shippingService.getOrderTracking(req.tenantId!, id, (req as any).user.userId);
    }
}

/** Admin endpoints for Blue Dart shipments. */
@Controller('admin/shipping')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminShippingController {
    constructor(private readonly shippingService: ShippingService) { }

    @Get('status')
    status() {
        return this.shippingService.getStatus();
    }

    @Post('orders/:id/waybill')
    createWaybill(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateWaybillDto) {
        return this.shippingService.createWaybill(req.tenantId!, id, dto);
    }

    @Post('orders/:id/waybill/cancel')
    cancelWaybill(@Req() req: Request, @Param('id') id: string) {
        return this.shippingService.cancelWaybill(req.tenantId!, id);
    }

    @Get('orders/:id/tracking')
    tracking(@Req() req: Request, @Param('id') id: string) {
        return this.shippingService.getOrderTracking(req.tenantId!, id);
    }

    @Get('orders/:id/label')
    async label(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
        const { filename, pdf } = await this.shippingService.getLabel(req.tenantId!, id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdf);
    }
}
