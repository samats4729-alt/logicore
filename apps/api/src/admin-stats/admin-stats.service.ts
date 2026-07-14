import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, OrderStatus } from '@prisma/client';

/**
 * Сводная статистика платформы для админ-панели.
 * Только агрегаты (счётчики/суммы), без персональных данных заявок.
 */
@Injectable()
export class AdminStatsService {
    constructor(private prisma: PrismaService) { }

    async getOverview() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Активные заявки — всё, что в работе (не черновик/не финал)
        const FINAL: OrderStatus[] = ['COMPLETED', 'CANCELLED'];
        const activeWhere = { status: { notIn: [...FINAL, 'DRAFT' as OrderStatus] } };

        const [
            companiesTotal,
            companiesNew30,
            officeUsers,
            drivers,
            ordersTotal,
            ordersMonth,
            ordersActive,
            ordersCompleted,
            ordersProblem,
            gmvMonthAgg,
            openTickets,
            byStatusRaw,
            ordersLast14Raw,
        ] = await Promise.all([
            // Реальные компании-арендаторы (не справочные внешние, не наша служебная)
            this.prisma.company.count({ where: { isExternal: false, isOurCompany: false } }),
            this.prisma.company.count({ where: { isExternal: false, isOurCompany: false, createdAt: { gte: days30Ago } } }),
            this.prisma.user.count({ where: { role: { not: UserRole.DRIVER }, isActive: true } }),
            this.prisma.user.count({ where: { role: UserRole.DRIVER } }),
            this.prisma.order.count(),
            this.prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
            this.prisma.order.count({ where: activeWhere }),
            this.prisma.order.count({ where: { status: 'COMPLETED' } }),
            this.prisma.order.count({ where: { status: 'PROBLEM' } }),
            this.prisma.order.aggregate({
                _sum: { customerPrice: true },
                where: { status: 'COMPLETED', createdAt: { gte: monthStart } },
            }),
            this.prisma.supportTicket.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }),
            this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
            this.prisma.order.findMany({
                where: { createdAt: { gte: days30Ago } },
                select: { createdAt: true },
            }),
        ]);

        // Заявки по статусам → простой словарь
        const byStatus: Record<string, number> = {};
        for (const row of byStatusRaw) byStatus[row.status] = row._count._all;

        // Заявки по дням за последние 14 дней (для мини-графика)
        const dailyMap = new Map<string, number>();
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            dailyMap.set(this.dayKey(d), 0);
        }
        for (const o of ordersLast14Raw) {
            const key = this.dayKey(new Date(o.createdAt));
            if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
        }
        const ordersDaily = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

        return {
            companies: { total: companiesTotal, new30: companiesNew30 },
            users: { office: officeUsers, drivers },
            orders: {
                total: ordersTotal,
                month: ordersMonth,
                active: ordersActive,
                completed: ordersCompleted,
                problem: ordersProblem,
            },
            gmvMonth: gmvMonthAgg._sum.customerPrice || 0,
            openTickets,
            byStatus,
            ordersDaily,
        };
    }

    private dayKey(d: Date): string {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
}
