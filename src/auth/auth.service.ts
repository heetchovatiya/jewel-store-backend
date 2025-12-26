import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CreateUserDto, LoginDto } from '../users/dto/user.dto';
import { User } from '../users/user.schema';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) { }

    async register(tenantId: string, createUserDto: CreateUserDto): Promise<{ user: Partial<User>; token: string }> {
        const user = await this.usersService.create(tenantId, createUserDto);
        const token = this.generateToken(user as any, tenantId);

        const { password, ...result } = (user as any).toObject();
        return { user: result, token };
    }

    async login(tenantId: string, loginDto: LoginDto): Promise<{ user: Partial<User>; token: string }> {
        const user = await this.usersService.findByEmail(tenantId, loginDto.email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isValid = await this.usersService.validatePassword(user, loginDto.password);

        if (!isValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Account is disabled');
        }

        const token = this.generateToken(user, tenantId);

        const { password, ...result } = user.toObject();
        return { user: result, token };
    }

    private generateToken(user: any, tenantId: string): string {
        const payload = {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            tenantId,
        };

        return this.jwtService.sign(payload);
    }
}
