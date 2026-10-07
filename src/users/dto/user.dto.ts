import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../user.schema';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    phone?: string;

    // SECURITY: no `role` here. Public signup always creates a customer.
    // Admins are promoted with `npm run make-admin -- <email>` (see scripts/make-admin.ts).
}

export class LoginDto {
    @IsString()
    identifier: string;

    @IsString()
    password: string;
}

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    phone?: string;
}

export class AddAddressDto {
    @IsOptional()
    @IsString()
    label?: string;

    @IsString()
    fullName: string;

    @IsString()
    phone: string;

    @IsString()
    addressLine1: string;

    @IsOptional()
    @IsString()
    addressLine2?: string;

    @IsString()
    city: string;

    @IsString()
    state: string;

    @IsString()
    pincode: string;

    @IsOptional()
    isDefault?: boolean;
}

/** Admin panel: change a user's role. */
export class UpdateUserRoleDto {
    @IsEnum(UserRole)
    role: UserRole;
}

/** Admin panel: list/search users. */
export class AdminUserQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    /** 'staff' = admin + super_admin */
    @IsOptional()
    @IsIn(['customer', 'admin', 'super_admin', 'staff'])
    role?: 'customer' | 'admin' | 'super_admin' | 'staff';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}
