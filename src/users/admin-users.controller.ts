import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UsersService } from './users.service';
import { AdminUserQueryDto, UpdateUserRoleDto } from './dto/user.dto';

/** Admin panel: list users and grant/revoke admin access. */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    list(@Req() req: Request, @Query() query: AdminUserQueryDto) {
        return this.usersService.listUsersForAdmin(req.tenantId!, query);
    }

    @Patch(':id/role')
    changeRole(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
        const actor = (req as any).user as { userId: string; role: string };
        return this.usersService.changeRole(req.tenantId!, actor, id, dto.role);
    }
}
