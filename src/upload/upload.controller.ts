import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, IsNotEmpty } from 'class-validator';
import { UploadService, PresignedUrlResponse, UploadResponse } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

class GetPresignedUrlDto {
    @IsString()
    @IsNotEmpty()
    folder: string;

    @IsString()
    @IsNotEmpty()
    filename: string;

    @IsString()
    @IsNotEmpty()
    contentType: string;
}

@Controller('admin/upload')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    /**
     * Upload a file directly (proxied through backend)
     * This avoids CORS issues with direct browser-to-S3 uploads
     */
    @Post('file')
    @UseInterceptors(FileInterceptor('file', {
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB limit
        },
        fileFilter: (req, file, callback) => {
            const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (allowedMimes.includes(file.mimetype)) {
                callback(null, true);
            } else {
                callback(new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
            }
        },
    }))
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Body('folder') folder: string,
    ): Promise<UploadResponse> {
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        const validFolders = ['banners', 'products', 'logos', 'about', 'categories'];
        if (!folder || !validFolders.includes(folder)) {
            throw new BadRequestException(`Invalid folder. Must be one of: ${validFolders.join(', ')}`);
        }

        return this.uploadService.uploadFile(
            folder,
            file.originalname,
            file.mimetype,
            file.buffer,
        );
    }

    /**
     * Generate a presigned URL for file upload (legacy, may have CORS issues)
     */
    @Post('presigned-url')
    async getPresignedUrl(
        @Body() dto: GetPresignedUrlDto,
    ): Promise<PresignedUrlResponse> {
        return this.uploadService.getPresignedUploadUrl(
            dto.folder,
            dto.filename,
            dto.contentType,
        );
    }
}
