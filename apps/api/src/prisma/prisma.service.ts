import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const connectionString = process.env.DATABASE_URL;
        const pool = new Pool({ connectionString });
        const adapter = new PrismaPg(pool);
        super({ adapter } as any);
    }
    async onModuleInit() {
        await this.$connect();
        await this.backfillUserCompanyRelations();
    }

    private async backfillUserCompanyRelations() {
        try {
            const users = await this.user.findMany({
                where: {
                    companyId: { not: null },
                },
                include: {
                    userCompanyRelations: true,
                },
            });

            for (const user of users) {
                const hasRelation = user.userCompanyRelations.some(
                    (r) => r.companyId === user.companyId,
                );
                if (!hasRelation && user.companyId) {
                    await this.userCompanyRelation.create({
                        data: {
                            userId: user.id,
                            companyId: user.companyId,
                            role: user.role,
                        },
                    }).catch((e) => {
                        console.error(`Failed to backfill relation for user ${user.id}:`, e);
                    });
                }
            }
        } catch (error) {
            console.error('Error during UserCompanyRelation backfill:', error);
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
