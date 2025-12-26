import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto, OrderQueryDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

// Customer endpoints
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Get()
    getMyOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
        return this.ordersService.getUserOrders(req.tenantId!, (req as any).user.userId, query);
    }

    @Get(':id')
    getOrder(@Req() req: Request, @Param('id') id: string) {
        return this.ordersService.getOrderById(req.tenantId!, id, (req as any).user.userId);
    }

    @Post()
    createOrder(@Req() req: Request, @Body() createDto: CreateOrderDto) {
        return this.ordersService.createOrder(req.tenantId!, (req as any).user.userId, createDto);
    }
}

// Admin endpoints
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Get()
    getAllOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
        return this.ordersService.getAllOrders(req.tenantId!, query);
    }

    @Get('stats')
    getStats(@Req() req: Request) {
        return this.ordersService.getOrderStats(req.tenantId!);
    }

    @Get(':id')
    getOrder(@Req() req: Request, @Param('id') id: string) {
        return this.ordersService.getOrderById(req.tenantId!, id);
    }

    @Patch(':id/status')
    updateStatus(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() updateDto: UpdateOrderStatusDto
    ) {
        return this.ordersService.updateOrderStatus(req.tenantId!, id, updateDto);
    }
}
