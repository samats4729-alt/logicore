import { PrismaService } from '../prisma/prisma.service';
import { компанииБазы } from '../common/driver-pool';

/**
 * Удостоверения водителей, у которых скоро кончается срок (задачи шефа, R5).
 *
 * Срок удостоверения хранится в анкете водителя, но никто о нём не
 * напоминал: узнавали на посту или у ворот склада, когда водителя с
 * просроченным документом разворачивали. Здесь — водители компании (своей
 * базы) и, если компания — парк, водители парка с биржи.
 *
 * Сроков страховки и техосмотра машины в системе нет — их здесь и нет.
 */
export const EXPIRY_WARN_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export interface ExpiringDocument {
    id: string;
    name: string;
    /** Удостоверение водителя компании или водителя парка с биржи. */
    kind: 'COMPANY_DRIVER' | 'PARK_DRIVER';
    expiresAt: string;
    expired: boolean;
    href: string;
}

const fullName = (u: { lastName?: string | null; firstName?: string | null }) =>
    [u.lastName, u.firstName].filter(Boolean).join(' ').trim() || 'Без имени';

export async function expiringDocuments(
    prisma: PrismaService,
    companyId: string,
    now = new Date(),
): Promise<ExpiringDocument[]> {
    const limit = new Date(now.getTime() + EXPIRY_WARN_DAYS * DAY);
    const [base, company] = await Promise.all([
        компанииБазы(prisma, companyId),
        prisma.company.findUnique({ where: { id: companyId }, select: { isPark: true } }),
    ]);

    const [drivers, parkDrivers] = await Promise.all([
        prisma.user.findMany({
            where: {
                role: 'DRIVER',
                isActive: true,
                docExpiresAt: { not: null, lte: limit },
                OR: [{ companyId: { in: [...base.keys()] } }, { baseCompanyId: companyId }],
            },
            orderBy: { docExpiresAt: 'asc' },
            take: 50,
            select: { id: true, firstName: true, lastName: true, docExpiresAt: true },
        }),
        company?.isPark
            ? prisma.exchangeDriver.findMany({
                where: {
                    parkCompanyId: companyId,
                    status: { in: ['APPROVED', 'PENDING'] },
                    idExpiresAt: { not: null, lte: limit },
                },
                orderBy: { idExpiresAt: 'asc' },
                take: 50,
                select: { id: true, firstName: true, lastName: true, idExpiresAt: true },
            })
            : Promise.resolve([]),
    ]);

    const rows: ExpiringDocument[] = [
        ...drivers.map((d) => ({
            id: d.id, name: fullName(d), kind: 'COMPANY_DRIVER' as const,
            expiresAt: d.docExpiresAt!.toISOString(), expired: d.docExpiresAt! < now,
            href: '/company/drivers',
        })),
        ...parkDrivers.map((d) => ({
            id: d.id, name: fullName(d), kind: 'PARK_DRIVER' as const,
            expiresAt: d.idExpiresAt!.toISOString(), expired: d.idExpiresAt! < now,
            href: `/company/park/drivers/${d.id}`,
        })),
    ];
    return rows.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}
