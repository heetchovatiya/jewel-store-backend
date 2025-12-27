import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUrlResponse {
    uploadUrl: string;
    publicUrl: string;
    key: string;
}

export interface UploadResponse {
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
     * Generate a unique key for a file
     */
    private generateKey(folder: string, filename: string): string {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const sanitizedFilename = filename
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '-')
            .replace(/-+/g, '-');
        return `${folder}/${timestamp}-${randomId}-${sanitizedFilename}`;
    }

    /**
     * Upload a file directly to DO Spaces (proxied through backend)
     * This avoids CORS issues by having the backend upload directly
     */
    async uploadFile(
        folder: string,
        filename: string,
        contentType: string,
        buffer: Buffer,
    ): Promise<UploadResponse> {
        const key = this.generateKey(folder, filename);

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            Body: buffer,
            ACL: 'public-read',
        });

        await this.s3Client.send(command);

        const publicUrl = `${this.cdnUrl}/${key}`;

        return {
            publicUrl,
            key,
        };
    }

    /**
     * Generate a presigned URL for uploading a file to DO Spaces
     * Note: This may have CORS issues with some S3-compatible services
     */
    async getPresignedUploadUrl(
        folder: string,
        filename: string,
        contentType: string,
    ): Promise<PresignedUrlResponse> {
        const key = this.generateKey(folder, filename);

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });

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
