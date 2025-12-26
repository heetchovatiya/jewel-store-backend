import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { UploadService, PresignedUrlResponse } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

class GetPresignedUrlDto {
    folder: string;
    filename: string;
    contentType: string;
}

@Controller('admin/upload')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    /**
     * Generate a presigned URL for file upload
     * Only admins can upload files
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
