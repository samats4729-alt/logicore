import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis | null = null;
    private isConnected = false;

    constructor(private configService: ConfigService) {
        const redisUrl = this.configService.get<string>('REDIS_URL');

        if (redisUrl) {
            this.client = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        this.logger.warn('Redis connection failed, running without cache');
                        return null; // Stop retrying
                    }
                    return Math.min(times * 100, 3000);
                },
            });

            this.client.on('connect', () => {
                this.isConnected = true;
                this.logger.log('✅ Redis connected');
            });

            this.client.on('error', (err) => {
                this.isConnected = false;
                this.logger.warn(`Redis error: ${err.message}`);
            });
        } else {
            this.logger.warn('⚠️ REDIS_URL not set, running without Redis cache');
        }
    }

    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit();
        }
    }

    // Check if Redis is available
    private canUseRedis(): boolean {
        return this.client !== null && this.isConnected;
    }

    // Session management for Single Session Policy
    async setSession(userId: string, deviceId: string, token: string, ttl: number): Promise<void> {
        if (!this.canUseRedis()) return;
        const key = `session:${userId}`;
        await this.client!.set(key, JSON.stringify({ deviceId, token }), 'EX', ttl);
    }

    async getSession(userId: string): Promise<{ deviceId: string; token: string } | null> {
        if (!this.canUseRedis()) return null;
        const data = await this.client!.get(`session:${userId}`);
        return data ? JSON.parse(data) : null;
    }

    async deleteSession(userId: string): Promise<void> {
        if (!this.canUseRedis()) return;
        await this.client!.del(`session:${userId}`);
    }

    // SMS code storage
    async setSmsCode(phone: string, code: string, ttl: number = 300): Promise<void> {
        if (!this.canUseRedis()) return;
        await this.client!.set(`sms:${phone}`, code, 'EX', ttl);
    }

    async getSmsCode(phone: string): Promise<string | null> {
        if (!this.canUseRedis()) return null;
        return this.client!.get(`sms:${phone}`);
    }

    async deleteSmsCode(phone: string): Promise<void> {
        if (!this.canUseRedis()) return;
        await this.client!.del(`sms:${phone}`);
    }

    // Generic methods
    async set(key: string, value: string, ttl?: number): Promise<void> {
        if (!this.canUseRedis()) return;
        if (ttl) {
            await this.client!.set(key, value, 'EX', ttl);
        } else {
            await this.client!.set(key, value);
        }
    }

    async get(key: string): Promise<string | null> {
        if (!this.canUseRedis()) return null;
        return this.client!.get(key);
    }

    async del(key: string): Promise<void> {
        if (!this.canUseRedis()) return;
        await this.client!.del(key);
    }

    getClient(): Redis | null {
        return this.client;
    }
}
