'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Clock, FileCheck2, FileWarning, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';
import DashboardCard from './DashboardCard';
import styles from './pending-work-card.module.css';

interface PendingWorkItem {
    id: string;
    label: string;
    counterparty: string | null;
    amount: number;
    daysWaiting: number;
    orderId?: string;
    documentId?: string;
}

interface PendingWorkGroup {
    count: number;
    total: number;
    truncated: boolean;
    items: PendingWorkItem[];
}

interface PendingWork {
    unconfirmedSettlements: PendingWorkGroup;
    ordersWithoutAct: PendingWorkGroup;
    actsWithoutInvoice: PendingWorkGroup;
    overdueInvoices: PendingWorkGroup;
}

type GroupKey = keyof PendingWork;

const money = (value: number) =>
    `${(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸`;

/** Правильное окончание: 1 день, 3 дня, 5 дней. */
const daysLabel = (days: number) => {
    const mod10 = days % 10;
    const mod100 = days % 100;
    if (mod100 >= 11 && mod100 <= 14) return `${days} дней`;
    if (mod10 === 1) return `${days} день`;
    if (mod10 >= 2 && mod10 <= 4) return `${days} дня`;
    return `${days} дней`;
};

const GROUPS: {
    key: GroupKey;
    title: string;
    hint: string;
    icon: React.ReactNode;
    /** Красным — только там, где деньги уже опаздывают. */
    negative?: boolean;
}[] = [
    {
        // Первым: пока расчёты не проверены, по рейсу нельзя ни заверить
        // договор, ни выставить счёт — то есть встают и остальные две группы.
        key: 'unconfirmedSettlements',
        title: 'Расчёты ждут проверки',
        hint: 'в карточке контрагента не заполнены НДС или срок оплаты',
        icon: <ShieldCheck size={14} />,
    },
    {
        key: 'ordersWithoutAct',
        title: 'Рейс завершён, акта нет',
        hint: 'услуга оказана, но документально не закрыта',
        icon: <FileWarning size={14} />,
    },
    {
        key: 'actsWithoutInvoice',
        title: 'Акт есть, счёта нет',
        hint: 'оплату по этим рейсам никто не запрашивал',
        icon: <FileCheck2 size={14} />,
    },
    {
        key: 'overdueInvoices',
        title: 'Счёт просрочен',
        hint: 'срок оплаты прошёл, деньги не пришли',
        icon: <Clock size={14} />,
        negative: true,
    },
];

/**
 * «Требует оформления» — незакрытые хвосты между рейсом и бухгалтерией.
 *
 * Отвечает на вопрос «что я забыл оформить», который иначе выясняется
 * обходом трёх журналов со сверкой по памяти. Показывает не всё подряд, а
 * первые несколько строк каждой группы: задача виджета — заметить проблему
 * и увести в нужное место, а не заменить журнал.
 */
export default function PendingWorkCard() {
    const router = useRouter();
    const [data, setData] = useState<PendingWork | null>(null);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);

    useEffect(() => {
        api.get('/accounting-documents/pending-work')
            .then((res) => setData(res.data))
            .catch(() => setAvailable(false))
            .finally(() => setLoading(false));
    }, []);

    if (!available) return null;

    const openItem = (key: GroupKey, item: PendingWorkItem) => {
        if (key === 'overdueInvoices' && item.documentId) {
            router.push(`/company/accounting/invoices/${item.documentId}`);
            return;
        }
        if (item.orderId) router.push(`/company/orders/${item.orderId}`);
    };

    const totalCount = data
        ? GROUPS.reduce((sum, group) => sum + (data[group.key]?.count ?? 0), 0)
        : 0;

    return (
        <DashboardCard
            icon={<ClipboardList size={14} />}
            title="Требует оформления"
            link={{ label: 'Журнал счетов', onClick: () => router.push('/company/accounting/invoices') }}
            hint="Незакрытые хвосты между рейсами и бухгалтерией."
        >
            {loading ? (
                <DashboardCard.Center><Loader /></DashboardCard.Center>
            ) : totalCount === 0 ? (
                <DashboardCard.Center>Всё оформлено — хвостов нет</DashboardCard.Center>
            ) : (
                <div className={styles.groups}>
                    {GROUPS.map((group) => {
                        const value = data?.[group.key];
                        if (!value || value.count === 0) return null;
                        return (
                            <div key={group.key}>
                                <div className={styles.groupHead}>
                                    <span className={`${styles.icon} ${group.negative ? styles.iconNeg : ''}`}>
                                        {group.icon}
                                    </span>
                                    <div className={styles.groupText}>
                                        <div className={styles.groupTitle}>
                                            {group.title}
                                            <span className={`${nova.chip} ${group.negative ? nova.chipNeg : ''}`}>
                                                {value.truncated ? `${value.count}+` : value.count}
                                            </span>
                                        </div>
                                        <div className={styles.groupHint}>{group.hint}</div>
                                    </div>
                                    <div className={styles.groupTotal}>{money(value.total)}</div>
                                </div>

                                <div className={styles.items}>
                                    {value.items.map((item) => (
                                        <button
                                            type="button"
                                            key={item.id}
                                            className={styles.item}
                                            onClick={() => openItem(group.key, item)}
                                        >
                                            <span className={styles.itemLabel}>{item.label}</span>
                                            <span className={styles.itemParty}>{item.counterparty || '—'}</span>
                                            <span className={styles.itemDays}>{daysLabel(item.daysWaiting)}</span>
                                            <span className={styles.itemSum}>{money(item.amount)}</span>
                                        </button>
                                    ))}
                                    {value.count > value.items.length && (
                                        <div className={styles.more}>
                                            и ещё {value.count - value.items.length}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </DashboardCard>
    );
}
