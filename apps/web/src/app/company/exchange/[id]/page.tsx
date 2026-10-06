'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Building2, MapPin, MessageSquareText, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { ExchangeOrder, день, тонн } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import OfferForm from '@/components/exchange/OfferForm';
import styles from '@/components/nova/nova.module.css';

const POINT_TITLE: Record<ExchangeOrder['points'][number]['type'], string> = {
    PICKUP: 'Погрузка',
    ADDITIONAL_PICKUP: 'Догруз',
    DELIVERY: 'Выгрузка',
};

/**
 * Заявка с биржи — как её видит перевозчик.
 *
 * Всё, чтобы решить «повезу или нет»: маршрут по точкам с датами, груз и
 * условия, цена и примечание компании. Адресов нет — их получит тот, кого
 * компания выберет. Справа — отклик: согласен на цену или своя цена.
 */
export default function ExchangeOrderPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [order, setOrder] = useState<ExchangeOrder | null>(null);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        api.get(`/exchange/board/${id}`)
            .then((r) => setOrder(r.data))
            .catch((e) => setFailed(e?.response?.status === 404
                ? 'Заявка уже снята с биржи или у неё появился исполнитель.'
                : 'Не удалось загрузить заявку — проверьте интернет и обновите страницу.'));
    }, [id]);

    const back = (
        <Button variant="outline" onClick={() => router.push('/company/exchange')}>
            <ArrowLeft className="h-4 w-4" /> К бирже
        </Button>
    );

    if (failed || !order) {
        return (
            <div className={styles.page}>
                <div className={styles.hero}>
                    <div>
                        <div className={styles.eyebrow}>Биржа</div>
                        <h1 className={styles.title}>{failed ? 'Заявка недоступна' : 'Загрузка…'}</h1>
                    </div>
                    <div className={styles.heroActions}>{back}</div>
                </div>
                {failed ? <div className={styles.card}><div className={styles.empty}>{failed}</div></div> : <div className={`${styles.card} h-64 animate-pulse`} />}
            </div>
        );
    }

    const temp = order.tempMin != null || order.tempMax != null
        ? `${order.tempMin ?? '…'}…${order.tempMax ?? '…'} °C`
        : null;

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа · заявка {order.orderNumber}</div>
                    <h1 className={`${styles.title} flex flex-wrap items-center gap-2`}>
                        {order.from} <ArrowRight className="h-6 w-6 text-muted-foreground" /> {order.to}
                    </h1>
                    <p className={styles.subtitle}>
                        {order.companyName ?? 'Компания'} · погрузка {день(order.loadingDate)}
                        {order.publishedAt ? ` · на бирже с ${dayjs(order.publishedAt).format('DD.MM HH:mm')}` : ''}
                    </p>
                </div>
                <div className={styles.heroActions}>{back}</div>
            </div>

            {order.own && (
                <div className="mb-4 rounded-xl border border-solid border-border bg-muted/40 px-3 py-2.5 text-[13px]">
                    Это ваша заявка. Управлять ею — в{' '}
                    <a className="lc-link" href={`/company/orders/${order.id}`}>карточке заявки</a>.
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                    <section className={styles.card} style={{ marginBottom: 0 }}>
                        <div className={styles.cardHead}>
                            <MapPin size={14} />
                            <h2 className={styles.cardTitle}>Маршрут</h2>
                        </div>
                        <ol className="m-0 list-none space-y-3 p-4">
                            {order.points.map((p, i) => (
                                <li key={i} className="flex items-start gap-3 text-[13px]">
                                    <span
                                        aria-hidden
                                        className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-solid border-foreground ${p.type === 'DELIVERY' ? '' : 'bg-foreground'}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold">
                                            {p.city}{p.region ? <span className="font-normal text-muted-foreground">, {p.region}</span> : null}
                                        </div>
                                        <div className="text-[12px] text-muted-foreground">
                                            {POINT_TITLE[p.type]} · {p.date ? dayjs(p.date).format('DD.MM.YYYY') : 'дата не указана'}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                        <p className="m-0 border-0 border-t border-solid border-border px-4 py-2.5 text-[12px] text-muted-foreground">
                            Точные адреса компания откроет исполнителю, которого выберет.
                        </p>
                    </section>

                    <section className={styles.card} style={{ marginBottom: 0 }}>
                        <div className={styles.cardHead}>
                            <Package size={14} />
                            <h2 className={styles.cardTitle}>Груз и условия</h2>
                        </div>
                        <div className={`${styles.cardBody} space-y-2 text-[13px]`}>
                            <Row label="Что везём" value={order.cargoDescription} />
                            <Row label="Кузов" value={order.bodyType} />
                            <Row label="Вес и объём" value={[тонн(order.weightKg), order.volumeM3 ? `${order.volumeM3} м³` : null].filter(Boolean).join(' · ')} />
                            {order.palletCount != null && <Row label="Паллет" value={String(order.palletCount)} />}
                            {order.natureOfCargo && <Row label="Характер груза" value={order.natureOfCargo} />}
                            {order.loadingTypes.length > 0 && <Row label="Загрузка" value={order.loadingTypes.join(', ')} />}
                            {order.packagingTypes.length > 0 && <Row label="Упаковка" value={order.packagingTypes.join(', ')} />}
                            {temp && <Row label="Температура" value={temp} />}
                            {order.adr && <Row label="Опасный груз" value={order.adrClass ? `ДОПОГ, класс ${order.adrClass}` : 'ДОПОГ'} />}
                            {order.requirements && <Row label="Требования" value={order.requirements} />}
                        </div>
                    </section>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                    <section className={styles.card} style={{ marginBottom: 0 }}>
                        <div className={styles.cardHead}>
                            <Building2 size={14} />
                            <h2 className={styles.cardTitle}>Цена</h2>
                        </div>
                        <div className={styles.cardBody}>
                            <div className="text-[12px] text-muted-foreground">Компания предлагает исполнителю</div>
                            <div className="text-[26px] font-bold leading-tight tabular-nums">
                                {order.price != null ? moneyShort(order.price) : 'договорная'}
                            </div>
                            {!order.own && (
                                <div className="mt-4">
                                    <OfferForm order={order} onChanged={(myOffer) => setOrder({ ...order, myOffer })} />
                                </div>
                            )}
                        </div>
                    </section>

                    {order.note && (
                        <section className={styles.card} style={{ marginBottom: 0 }}>
                            <div className={styles.cardHead}>
                                <MessageSquareText size={14} />
                                <h2 className={styles.cardTitle}>От компании</h2>
                            </div>
                            <div className={`${styles.cardBody} whitespace-pre-wrap text-[13px]`}>{order.note}</div>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="whitespace-pre-wrap">{value || '—'}</span>
        </div>
    );
}
