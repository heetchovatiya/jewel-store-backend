import { Controller, Get, Patch, Post, Body, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto, AddAddressDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('profile')
    async getProfile(@Req() req: Request) {
        const user = await this.usersService.findById(req.tenantId!, (req as any).user.userId);
        if (user) {
            const { password, ...result } = user.toObject();
            return result;
        }
        return null;
    }

    @Patch('profile')
    async updateProfile(@Req() req: Request, @Body() updateDto: UpdateUserDto) {
        return this.usersService.update(req.tenantId!, (req as any).user.userId, updateDto);
    }

    @Get('addresses')
    async getAddresses(@Req() req: Request) {
        const user = await this.usersService.findById(req.tenantId!, (req as any).user.userId);
        return user?.addresses || [];
    }

    @Post('addresses')
    async addAddress(@Req() req: Request, @Body() addressDto: AddAddressDto) {
        return this.usersService.addAddress(req.tenantId!, (req as any).user.userId, addressDto);
    }

    @Delete('addresses/:index')
    async removeAddress(@Req() req: Request, @Param('index') index: string) {
        return this.usersService.removeAddress(req.tenantId!, (req as any).user.userId, parseInt(index));
    }
}
