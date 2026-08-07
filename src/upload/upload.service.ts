import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUrlResponse {
    uploadUrl: string;
    publicUrl: string;
    key: string;
    /** Must be sent as Cache-Control header on the client PUT (signed). */
    cacheControl: string;
    /** Must be sent as Content-Type header on the client PUT (signed). */
    contentType: string;
}

export interface UploadResponse {
    publicUrl: string;
    key: string;
}

/** Default expiry for private object download URLs (15 minutes). */
const PRIVATE_URL_EXPIRES_IN = 900;
/** Presigned upload URL lifetime (10 minutes). */
const UPLOAD_URL_EXPIRES_IN = 600;
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);
    private readonly s3Client: S3Client;
    private readonly bucket: string;
    private readonly publicDomain: string;
    private readonly cacheControl: string;

    constructor(private configService: ConfigService) {
        // Prefer R2_* names; fall back to AWS_*/S3_* for compatibility
        const endpoint =
            this.configService.get<string>('R2_ENDPOINT') ||
            this.configService.get<string>('S3_ENDPOINT');
        const accessKeyId =
            this.configService.get<string>('R2_ACCESS_KEY_ID') ||
            this.configService.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKey =
            this.configService.get<string>('R2_SECRET_ACCESS_KEY') ||
            this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

        if (!endpoint || !accessKeyId || !secretAccessKey) {
            this.logger.warn(
                'R2 is not fully configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT.',
            );
        }

        // Cloudflare R2: region "auto"; forcePathStyle required for SigV4
        this.s3Client = new S3Client({
            region: 'auto',
            endpoint: endpoint || undefined,
            credentials: {
                accessKeyId: accessKeyId || '',
                secretAccessKey: secretAccessKey || '',
            },
            forcePathStyle: true,
        });

        this.bucket =
            this.configService.get<string>('R2_BUCKET_NAME') ||
            this.configService.get<string>('S3_BUCKET_NAME') ||
            '';

        const rawDomain =
            this.configService.get<string>('CDN_BASE_URL') ||
            this.configService.get<string>('R2_PUBLIC_DOMAIN') ||
            this.configService.get<string>('S3_CUSTOM_DOMAIN') ||
            '';
        this.publicDomain = rawDomain.replace(/\/$/, '');

        this.cacheControl =
            this.configService.get<string>('R2_CACHE_CONTROL') || DEFAULT_CACHE_CONTROL;
    }

    private generateKey(folder: string, filename: string): string {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const sanitizedFilename = filename
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '-')
            .replace(/-+/g, '-');
        return `${folder}/${timestamp}-${randomId}-${sanitizedFilename}`;
    }

    /** Accept bare object key or full CDN/Spaces URL. */
    private resolveKey(keyOrUrl: string): string | null {
        if (!keyOrUrl?.trim()) return null;
        const trimmed = keyOrUrl.trim();
        if (!/^https?:\/\//i.test(trimmed)) {
            return trimmed.replace(/^\//, '');
        }
        try {
            return new URL(trimmed).pathname.replace(/^\//, '') || null;
        } catch {
            return null;
        }
    }

    /** Public asset URL via CDN_BASE_URL / R2_PUBLIC_DOMAIN — never the raw R2 API endpoint. */
    private buildPublicUrl(key: string): string {
        if (!this.publicDomain) {
            this.logger.warn('CDN_BASE_URL / R2_PUBLIC_DOMAIN is not set; public URLs may be incorrect');
            return key;
        }
        return `${this.publicDomain}/${key}`;
    }

    /** Expose public URL builder for callers that already have a storage key. */
    getPublicUrl(key: string): string {
        return this.buildPublicUrl(key);
    }

    /**
     * Server-side PutObject fallback (counts as Class A on R2 + uses Droplet bandwidth).
     * Prefer getPresignedUploadUrl for admin media so the browser PUTs directly to R2.
     * Never uses ListObjects — product metadata lives in MongoDB.
     */
    async uploadFile(
        folder: string,
        filename: string,
        contentType: string,
        buffer: Buffer,
    ): Promise<UploadResponse> {
        const key = this.generateKey(folder, filename);

        await this.s3Client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: contentType,
                Body: buffer,
                CacheControl: this.cacheControl,
            }),
        );

        return {
            publicUrl: this.buildPublicUrl(key),
            key,
        };
    }

    /**
     * Delete by object key or CDN URL pathname (Class A). No ListObjects.
     */
    async deleteFile(keyOrUrl: string): Promise<boolean> {
        const key = this.resolveKey(keyOrUrl);
        if (!key) {
            this.logger.warn(`Could not resolve R2 key from: ${keyOrUrl}`);
            return false;
        }

        try {
            await this.s3Client.send(
                new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }),
            );
            this.logger.log(`Deleted object from R2: ${key}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to delete object from R2: ${key}`, error);
            return false;
        }
    }

    /**
     * Presigned PUT for direct browser → R2 upload (preferred path).
     * Client must send the same Content-Type and Cache-Control headers.
     * Single PutObject only — keep files under ~200MB (no multipart).
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
            CacheControl: this.cacheControl,
        });

        const uploadUrl = await getSignedUrl(this.s3Client, command, {
            expiresIn: UPLOAD_URL_EXPIRES_IN,
        });

        return {
            uploadUrl,
            publicUrl: this.buildPublicUrl(key),
            key,
            cacheControl: this.cacheControl,
            contentType,
        };
    }

    /**
     * Presigned GET for private objects only (Class B). Public media should use R2_PUBLIC_DOMAIN CDN.
     */
    async getPresignedDownloadUrl(key: string, expiresIn = PRIVATE_URL_EXPIRES_IN): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        return getSignedUrl(this.s3Client, command, { expiresIn });
    }
}
