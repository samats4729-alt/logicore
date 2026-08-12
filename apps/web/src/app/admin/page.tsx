'use client';

import { useEffect, useState } from 'react';
import {
    Building2,
    CarFront,
    CheckCircle2,
    Clock3,
    Headset,
    TrendingUp,
    Users,
    Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import StatusPill from '@/components/ui/StatusPill';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';
import styles from './admin-dashboard.module.css';

/**
 * Сводка по платформе — первое, что видит владелец.
 *
 * Цифры те же, что были, но читаются иначе. Раньше каждая плитка красилась
 * своим цветом: синяя, бирюзовая, зелёная, фиолетовая — восемь показателей и
 * шесть цветов, из которых ни один ничего не означал. Цвет остался там, где
 * он несёт смысл: проблемные заявки и открытые обращения.
 */

interface Overview {
    companies: { total: number; new30: number };
    users: { office: number; drivers: number };
    orders: { total: number; month: number; active: number; completed: number; problem: number };
    gmvMonth: number;
    openTickets: number;
    byStatus: Record<string, number>;
    ordersDaily: { date: string; count: number }[];
}

const fmt = (n: number) => n.toLocaleString('ru-RU');

/** Плитка показателя: подпись, значение и строка пояснения под ним. */
function Tile({ icon, label, value, sub, tone }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: React.ReactNode;
    tone?: 'pos' | 'warn';
}) {
    return (
        <div className={nova.tile}>
            <div className={nova.tileHead}>
                <span className={nova.tileLabel}>{label}</span>
                <span className={styles.tileIcon}>{icon}</span>
            </div>
            <div className={`${nova.tileValue}${tone === 'warn' ? ` ${nova.valueWarn}` : ''}`}>
                {value}
            </div>
            {sub && <div className={nova.tileSub}>{sub}</div>}
        </div>
    );
}

export default function AdminDashboard() {
    const [data, setData] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/admin/stats')
            .then(res => setData(res.data))
            .catch(err => console.error('Failed to fetch stats:', err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className={nova.empty}><Loader size="large" /></div>;
    }

    if (!data) {
        return <div className={nova.empty}>Не удалось загрузить статистику</div>;
    }

    const maxDaily = Math.max(1, ...data.ordersDaily.map(d => d.count));
    const statusEntries = Object.entries(data.byStatus).sort((a, b) => b[1] - a[1]);

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Дашборд</h1>
                    <p className={nova.subtitle}>
                        Сводка по всей платформе. Обновляется при каждом открытии страницы.
                    </p>
                </div>
            </div>

            <div className={nova.tiles}>
                <Tile
                    icon={<Building2 size={15} />}
                    label="Компаний"
                    value={fmt(data.companies.total)}
                    sub={<><TrendingUp size={11} /> +{data.companies.new30} за 30 дней</>}
                />
                <Tile
                    icon={<Users size={15} />}
                    label="Сотрудников компаний"
                    value={fmt(data.users.office)}
                    sub="без учёта водителей"
                />
                <Tile
                    icon={<CarFront size={15} />}
                    label="Водителей"
                    value={fmt(data.users.drivers)}
                />
                <Tile
                    icon={<Headset size={15} />}
                    label="Открытых обращений"
                    value={fmt(data.openTickets)}
                    // Цветом только то, что требует действия: ждущее обращение
                    // — это человек, которому не ответили.
                    tone={data.openTickets > 0 ? 'warn' : undefined}
                    sub={data.openTickets > 0 ? 'ждут ответа' : 'все закрыты'}
                />
            </div>

            <div className={nova.tiles}>
                <Tile
                    icon={<Clock3 size={15} />}
                    label="Заявок за месяц"
                    value={fmt(data.orders.month)}
                    sub={`всего за всё время: ${fmt(data.orders.total)}`}
                />
                <Tile
                    icon={<CarFront size={15} />}
                    label="Активных заявок"
                    value={fmt(data.orders.active)}
                    sub="в работе прямо сейчас"
                />
                <Tile
                    icon={<CheckCircle2 size={15} />}
                    label="Завершено заявок"
                    value={fmt(data.orders.completed)}
                    sub={data.orders.problem > 0
                        ? <span className={nova.valueNeg}>проблемных: {data.orders.problem}</span>
                        : undefined}
                />
                <Tile
                    icon={<Wallet size={15} />}
                    label="Оборот за месяц"
                    value={`${fmt(Math.round(data.gmvMonth))} ₸`}
                    sub="сумма завершённых заявок"
                />
            </div>

            <div className={nova.duo}>
                <section className={nova.card}>
                    <div className={nova.cardHead}>
                        <TrendingUp size={14} />
                        <h2 className={nova.cardTitle}>Новые заявки за 14 дней</h2>
                    </div>
                    <div className={nova.cardBody}>
                        <div className={styles.chart}>
                            {data.ordersDaily.map((d) => (
                                <div key={d.date} className={styles.bar} title={`${d.date}: ${d.count}`}>
                                    <span className={styles.barValue}>{d.count > 0 ? d.count : ''}</span>
                                    <span
                                        className={`${styles.barFill}${d.count > 0 ? '' : ` ${styles.barEmpty}`}`}
                                        style={{ height: `${Math.max(Math.round((d.count / maxDaily) * 130), 3)}px` }}
                                    />
                                    <span className={styles.barDay}>{d.date.slice(8, 10)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className={nova.card}>
                    <div className={nova.cardHead}>
                        <CheckCircle2 size={14} />
                        <h2 className={nova.cardTitle}>Заявки по статусам</h2>
                    </div>
                    <div className={nova.cardBody}>
                        {statusEntries.length === 0 ? (
                            <div className={nova.empty}>Пока нет заявок</div>
                        ) : (
                            <div className={styles.statuses}>
                                {statusEntries.map(([status, count]) => (
                                    <div key={status} className={styles.statusRow}>
                                        <StatusPill status={status} />
                                        <b className={styles.statusCount}>{fmt(count)}</b>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
