/**
 * Суточные водителю — расход рейса (Q13, владелец 25.10.2026).
 *
 * Только штатному водителю компании в командировке. Водителю по ГПХ (парк
 * с биржи) суточные сами не начисляются: у него согласованное
 * вознаграждение по договору. Перевозчик со своим ИП свои расходы
 * закладывает в цену. Налоговую сторону суточных (сколько не облагается и
 * как отражать) решает бухгалтер — в расчётах налогов они здесь не
 * участвуют, это просто расход рейса.
 */
export const PER_DIEM_CATEGORY = { value: 'per_diem', label: 'Суточные водителю' };

interface OrderForPerDiem {
    partnerId?: string | null;
    subForwarderId?: string | null;
    driver?: { role?: string | null; companyId?: string | null; firstName?: string | null; lastName?: string | null } | null;
    assignedDriverName?: string | null;
    routePoints?: { pointType: string; expectedDate?: string | null }[] | null;
}

/** Дней в пути по маршруту: от первой погрузки до последней выгрузки, оба дня в счёт. */
export function tripDays(order: OrderForPerDiem): number {
    const points = order.routePoints ?? [];
    const pickup = points.find((p) => p.pointType !== 'DELIVERY' && p.expectedDate)?.expectedDate;
    const delivery = [...points].reverse().find((p) => p.pointType === 'DELIVERY' && p.expectedDate)?.expectedDate;
    if (!pickup || !delivery) return 1;
    const day = (iso: string) => {
        const d = new Date(iso);
        return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    };
    return Math.max(1, Math.round((day(delivery) - day(pickup)) / 86_400_000) + 1);
}

/** Рейс везёт свой штатный водитель — суточные уместны; иначе null. */
export function perDiemFor(order: OrderForPerDiem | null | undefined, companyId?: string | null) {
    if (!order || !companyId) return null;
    if (order.partnerId || order.subForwarderId) return null;
    const d = order.driver;
    if (!d || d.role !== 'DRIVER' || d.companyId !== companyId) return null;
    const driverName = [d.lastName, d.firstName].filter(Boolean).join(' ') || order.assignedDriverName || 'водителю';
    return { driverName, days: tripDays(order) };
}
