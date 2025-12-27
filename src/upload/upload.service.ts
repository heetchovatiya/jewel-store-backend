import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUrlResponse {
    uploadUrl: string;
    publicUrl: string;
    key: string;
}

@Injectable()
export class UploadService {
    private s3Client: S3Client;
    private bucket: string;
    private cdnUrl: string;

    constructor(private configService: ConfigService) {
        const region = this.configService.get<string>('DO_SPACES_REGION') || 'sgp1';
        const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT') || `https://${region}.digitaloceanspaces.com`;

        this.s3Client = new S3Client({
            region,
            endpoint,
            credentials: {
                accessKeyId: this.configService.get<string>('DO_SPACES_KEY') || '',
                secretAccessKey: this.configService.get<string>('DO_SPACES_SECRET') || '',
            },
            forcePathStyle: false,
        });

        this.bucket = this.configService.get<string>('DO_SPACES_BUCKET') || 'jewelstore';
        this.cdnUrl = this.configService.get<string>('DO_SPACES_CDN_URL') ||
            `https://${this.bucket}.${region}.digitaloceanspaces.com`;
    }

    /**
     * Generate a presigned URL for uploading a file to DO Spaces
     * @param folder - The folder/prefix in the bucket (e.g., 'banners', 'products', 'logos')
     * @param filename - Original filename (will be sanitized)
     * @param contentType - MIME type of the file
     * @returns PresignedUrlResponse with upload URL and final public URL
     */
    async getPresignedUploadUrl(
        folder: string,
        filename: string,
        contentType: string,
    ): Promise<PresignedUrlResponse> {
        // Sanitize filename and create unique key
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const sanitizedFilename = filename
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '-')
            .replace(/-+/g, '-');
        const key = `${folder}/${timestamp}-${randomId}-${sanitizedFilename}`;

        // Note: ACL is not included here - DO Spaces bucket should be configured
        // with public file access at the bucket level for simpler, more reliable access
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });

        // Generate presigned URL valid for 10 minutes
        const uploadUrl = await getSignedUrl(this.s3Client, command, {
            expiresIn: 600,
        });

        const publicUrl = `${this.cdnUrl}/${key}`;

        return {
            uploadUrl,
            publicUrl,
            key,
        };
    }
}
