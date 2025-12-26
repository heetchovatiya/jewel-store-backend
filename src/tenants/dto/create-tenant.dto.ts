import { IsString, IsBoolean, IsOptional, IsEmail } from 'class-validator';

export class CreateTenantDto {
    @IsString()
    name: string;

    @IsString()
    slug: string;

    @IsOptional()
    @IsString()
    domain?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsEmail()
    ownerEmail?: string;

    @IsOptional()
    @IsString()
    ownerPhone?: string;
}
