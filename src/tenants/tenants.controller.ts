import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Controller('super/tenants')
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    // @UseGuards(SuperAdminGuard) - TODO: Add super admin guard
    create(@Body() createTenantDto: CreateTenantDto) {
        return this.tenantsService.create(createTenantDto);
    }

    @Get()
    // @UseGuards(SuperAdminGuard)
    findAll() {
        return this.tenantsService.findAll();
    }

    @Get(':slug')
    findBySlug(@Param('slug') slug: string) {
        return this.tenantsService.findBySlug(slug);
    }

    @Patch(':id')
    // @UseGuards(SuperAdminGuard)
    update(@Param('id') id: string, @Body() updateData: Partial<CreateTenantDto>) {
        return this.tenantsService.update(id, updateData);
    }
}
