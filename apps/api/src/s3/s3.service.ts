import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class S3Service implements OnModuleInit {
    private readonly logger = new Logger(S3Service.name);
    private s3Client: S3Client | null = null;
    private bucket: string | null = null;
    private region: string = 'eu-central-1';
    private isEnabled: boolean = false;

    constructor(private configService: ConfigService) {}

    onModuleInit() {
        const accessKey = this.configService.get<string>('S3_ACCESS_KEY') || this.configService.get<string>('AWS_ACCESS_KEY_ID');
        const secretKey = this.configService.get<string>('S3_SECRET_KEY') || this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
        this.bucket = this.configService.get<string>('S3_BUCKET') || this.configService.get<string>('AWS_S3_BUCKET') || null;
        this.region = this.configService.get<string>('S3_REGION') || this.configService.get<string>('AWS_REGION') || 'eu-central-1';
        const endpoint = this.configService.get<string>('S3_ENDPOINT') || undefined;

        if (!accessKey || !secretKey || !this.bucket) {
            this.logger.warn('S3 credentials not fully configured (S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET). Falling back to local file storage.');
            this.isEnabled = false;
            return;
        }

        try {
            const clientConfig: any = {
                region: this.region,
                credentials: {
                    accessKeyId: accessKey,
                    secretAccessKey: secretKey,
                },
            };

            if (endpoint) {
                clientConfig.endpoint = endpoint;
                // For custom S3-like providers, force path style requests if needed
                clientConfig.forcePathStyle = true;
            }

            this.s3Client = new S3Client(clientConfig);
            this.isEnabled = true;
            this.logger.log(`S3 client initialized successfully for bucket "${this.bucket}" in region "${this.region}".`);
        } catch (error) {
            this.logger.error('Failed to initialize S3 client:', error);
            this.isEnabled = false;
        }
    }

    isS3Enabled(): boolean {
        return this.isEnabled;
    }

    async uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<string> {
        if (!this.isEnabled || !this.s3Client || !this.bucket) {
            throw new Error('S3 storage is not enabled.');
        }

        try {
            await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    Body: buffer,
                    ContentType: mimeType,
                })
            );
            this.logger.log(`Successfully uploaded file to S3: ${key}`);
            return key;
        } catch (error) {
            this.logger.error(`S3 upload error for key "${key}":`, error);
            throw error;
        }
    }

    async downloadFile(key: string): Promise<{ stream: Readable; mimeType?: string; size?: number }> {
        if (!this.isEnabled || !this.s3Client || !this.bucket) {
            throw new Error('S3 storage is not enabled.');
        }

        try {
            const response = await this.s3Client.send(
                new GetObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                })
            );

            return {
                stream: response.Body as Readable,
                mimeType: response.ContentType,
                size: response.ContentLength,
            };
        } catch (error) {
            this.logger.error(`S3 download error for key "${key}":`, error);
            throw error;
        }
    }

    async deleteFile(key: string): Promise<void> {
        if (!this.isEnabled || !this.s3Client || !this.bucket) {
            return;
        }

        try {
            await this.s3Client.send(
                new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                })
            );
            this.logger.log(`Successfully deleted file from S3: ${key}`);
        } catch (error) {
            this.logger.error(`S3 deletion error for key "${key}":`, error);
        }
    }
}
