import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginDto } from '../users/dto/user.dto';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    async register(@Req() req: Request, @Body() createUserDto: CreateUserDto) {
        return this.authService.register(req.tenantId!, createUserDto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Req() req: Request, @Body() loginDto: LoginDto) {
        return this.authService.login(req.tenantId!, loginDto);
    }
}
