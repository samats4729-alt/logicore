/**
 * С кем водителю связаться по рейсу (владелец, 28.10.2026): кнопка WhatsApp
 * в приложении ведёт в чат с тем, кто этот рейс ведёт.
 *
 * Компания водителя в рейсе — парк (исполнитель), иначе та, где водитель
 * работает, иначе экспедитор. От неё — ответственный по этой заявке; не
 * назначен или без телефона — общий номер компании. Чужих ответственных
 * (экспедитора, заказчика) водителю не показываем.
 */
export type TripManager = {
    /** Имя ответственного или название компании, если ответственного нет. */
    name: string;
    phone: string;
    /** true — ответственный по этому рейсу; false — общий номер компании. */
    responsible: boolean;
};

type OrderSidesForDriver = { partnerId: string | null; forwarderId: string | null };
type Responsible = { companyId: string; user: { firstName: string | null; lastName: string | null; phone: string | null; isActive: boolean } };
type CompanyContact = { id: string; name: string; phone: string | null };

/** Чья это компания для водителя в этом рейсе. */
export function driverCompanyOf(order: OrderSidesForDriver, driverCompanyId: string | null): string | null {
    return order.partnerId || driverCompanyId || order.forwarderId || null;
}

export function tripManagerFor(
    order: OrderSidesForDriver & { responsibles: Responsible[] },
    driverCompanyId: string | null,
    companies: Map<string, CompanyContact>,
): TripManager | null {
    const companyId = driverCompanyOf(order, driverCompanyId);
    if (!companyId) return null;
    const r = order.responsibles.find((x) => x.companyId === companyId)?.user;
    if (r?.isActive && r.phone?.trim()) {
        return { name: [r.lastName, r.firstName].filter(Boolean).join(' ') || 'Менеджер', phone: r.phone.trim(), responsible: true };
    }
    const company = companies.get(companyId);
    return company?.phone?.trim() ? { name: company.name, phone: company.phone.trim(), responsible: false } : null;
}
