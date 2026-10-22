import { PrismaService } from '../prisma/prisma.service';
import { компанииБазы } from '../common/driver-pool';

/**
 * Документы, у которых скоро кончается срок (задачи шефа, R5).
 *
 * Срок удостоверения хранится в анкете водителя, но никто о нём не
 * напоминал: узнавали на посту или у ворот склада, когда водителя с
 * просроченным документом разворачивали. Здесь — водители компании (своей
 * базы) и, если компания — парк, водители парка с биржи.
 *
 * То же со своими машинами: страховка и техосмотр. Без страховки машину
 * снимают с линии на первом же посту, а штраф и простой ложатся на рейс.
 */
export const EXPIRY_WARN_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export interface ExpiringDocument {
    id: string;
    name: string;
    /** Удостоверение водителя компании или парка; страховка или техосмотр своей машины. */
    kind: 'COMPANY_DRIVER' | 'PARK_DRIVER' | 'VEHICLE_INSURANCE' | 'VEHICLE_INSPECTION';
    expiresAt: string;
    expired: boolean;
    href: string;
}

const fullName = (u: { lastName?: string | null; firstName?: string | null }) =>
    [u.lastName, u.firstName].filter(Boolean).join(' ').trim() || 'Без имени';

const vehicleName = (v: { plate: string; model: string }) => [v.plate, v.model].filter(Boolean).join(' · ');

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

    const [drivers, parkDrivers, vehicles] = await Promise.all([
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
        prisma.vehicle.findMany({
            where: {
                companyId,
                isActive: true,
                OR: [{ insuranceUntil: { lte: limit } }, { inspectionUntil: { lte: limit } }],
            },
            take: 50,
            select: { id: true, plate: true, model: true, insuranceUntil: true, inspectionUntil: true },
        }),
    ]);

    const vehicleRows: ExpiringDocument[] = [];
    for (const v of vehicles) {
        // У одной машины может кончаться и то и другое — это две разные бумаги.
        if (v.insuranceUntil && v.insuranceUntil <= limit) {
            vehicleRows.push({
                id: v.id, name: vehicleName(v), kind: 'VEHICLE_INSURANCE',
                expiresAt: v.insuranceUntil.toISOString(), expired: v.insuranceUntil < now,
                href: '/company/vehicles',
            });
        }
        if (v.inspectionUntil && v.inspectionUntil <= limit) {
            vehicleRows.push({
                id: v.id, name: vehicleName(v), kind: 'VEHICLE_INSPECTION',
                expiresAt: v.inspectionUntil.toISOString(), expired: v.inspectionUntil < now,
                href: '/company/vehicles',
            });
        }
    }

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
        ...vehicleRows,
    ];
    return rows.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export interface VehicleDocDatesInput {
    insuranceUntil?: string | null;
    inspectionUntil?: string | null;
}

/**
 * Сроки страховки и техосмотра из формы «Автопарка» — в даты для базы.
 * Не прислали — не трогаем; прислали пустое — срок стёрли.
 */
export function vehicleDocDates(input: VehicleDocDatesInput): { insuranceUntil?: Date | null; inspectionUntil?: Date | null } {
    const toDate = (value: string | null | undefined) =>
        value === undefined ? undefined : value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : null;
    return { insuranceUntil: toDate(input.insuranceUntil), inspectionUntil: toDate(input.inspectionUntil) };
}
