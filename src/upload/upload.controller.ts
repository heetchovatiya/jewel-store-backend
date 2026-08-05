import {
    Controller,
    Post,
    Delete,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, IsNotEmpty } from 'class-validator';
import { UploadService, PresignedUrlResponse, UploadResponse } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

const VALID_FOLDERS = ['banners', 'products', 'logos', 'about', 'categories'] as const;
/** Keep under 200MB to avoid multipart Class A amplification; app limit is tighter. */
const MAX_PROXY_BYTES = 20 * 1024 * 1024;

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

class DeleteFileDto {
    @IsString()
    @IsNotEmpty()
    url: string;
}

@Controller('admin/upload')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    private assertFolder(folder: string) {
        if (!folder || !(VALID_FOLDERS as readonly string[]).includes(folder)) {
            throw new BadRequestException(`Invalid folder. Must be one of: ${VALID_FOLDERS.join(', ')}`);
        }
    }

    /**
     * Preferred: issue a short-lived presigned PUT URL so the browser uploads
     * directly to R2 (Class A on R2 only — no Droplet bandwidth / body proxy).
     */
    @Post('presigned-url')
    async getPresignedUrl(@Body() dto: GetPresignedUrlDto): Promise<PresignedUrlResponse> {
        this.assertFolder(dto.folder);
        return this.uploadService.getPresignedUploadUrl(
            dto.folder,
            dto.filename,
            dto.contentType,
        );
    }

    /**
     * Fallback: proxy upload through the Droplet (still sets Cache-Control).
     * Prefer POST /presigned-url for normal admin media.
     */
    @Post('file')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: MAX_PROXY_BYTES },
        fileFilter: (req, file, callback) => {
            const allowedMimes = [
                'image/jpeg', 'image/png', 'image/webp', 'image/gif',
                'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
            ];
            if (allowedMimes.includes(file.mimetype)) {
                callback(null, true);
            } else {
                callback(
                    new BadRequestException(
                        `File type not allowed. Received: ${file.mimetype}. Allowed: images (JPEG, PNG, WebP, GIF) and videos (MP4, WebM, MOV, AVI)`,
                    ),
                    false,
                );
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
        this.assertFolder(folder);

        return this.uploadService.uploadFile(
            folder,
            file.originalname,
            file.mimetype,
            file.buffer,
        );
    }

    @Delete('file')
    async deleteFile(@Body() dto: DeleteFileDto): Promise<{ success: boolean }> {
        const success = await this.uploadService.deleteFile(dto.url);
        return { success };
    }

    /**
     * Short-lived (15m) GET URL for private objects only.
     * Public shop media should be read from R2_PUBLIC_DOMAIN (CDN cache → near-zero Class B).
     */
    @Post('presigned-download')
    async getPresignedDownload(
        @Body() body: { key: string },
    ): Promise<{ downloadUrl: string }> {
        if (!body?.key?.trim()) {
            throw new BadRequestException('key is required');
        }
        const downloadUrl = await this.uploadService.getPresignedDownloadUrl(body.key.trim());
        return { downloadUrl };
    }
}
