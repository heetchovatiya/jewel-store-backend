import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from '../../common/security-config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly usersService: UsersService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: getJwtSecret(),
        });
    }

    /**
     * The role is read from the database on every request, NOT trusted from the token,
     * so promoting/demoting an admin in the admin panel takes effect immediately
     * (and deleted users are logged out).
     */
    async validate(payload: any) {
        const role = await this.usersService.getRole(payload.tenantId, payload.sub);
        if (!role) {
            throw new UnauthorizedException('Account not found');
        }
        return {
            userId: payload.sub,
            email: payload.email,
            role,
            tenantId: payload.tenantId,
        };
    }
}
