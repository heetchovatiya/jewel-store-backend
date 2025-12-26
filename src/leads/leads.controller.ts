import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto } from './dto/lead.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

// Public endpoint for lead submission
@Controller('leads')
export class LeadsController {
    constructor(private readonly leadsService: LeadsService) { }

    @Post()
    create(@Req() req: Request, @Body() createDto: CreateLeadDto) {
        return this.leadsService.create(req.tenantId!, createDto);
    }
}

// Admin endpoints
@Controller('admin/leads')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLeadsController {
    constructor(private readonly leadsService: LeadsService) { }

    @Get()
    findAll(@Req() req: Request, @Query() query: LeadQueryDto) {
        return this.leadsService.findAll(req.tenantId!, query);
    }

    @Get('count')
    getNewCount(@Req() req: Request) {
        return this.leadsService.getNewLeadsCount(req.tenantId!);
    }

    @Get(':id')
    findOne(@Req() req: Request, @Param('id') id: string) {
        return this.leadsService.findById(req.tenantId!, id);
    }

    @Patch(':id')
    update(@Req() req: Request, @Param('id') id: string, @Body() updateDto: UpdateLeadDto) {
        return this.leadsService.update(req.tenantId!, id, updateDto);
    }
}
