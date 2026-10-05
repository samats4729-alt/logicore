'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Images, ListChecks, Package, Phone, Truck, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { EXCHANGE_LOAD_STATUS_LABELS } from '@/lib/vocabulary';
import { ExchangeLoad, вКавычках, датаПрошла, когдаПогрузка, телефонКрасиво, тонн } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import StatusPill from '@/components/ui/StatusPill';
import { LoadPhotos } from '@/components/exchange/LoadPhotos';
import { CancelLoadDialog } from '@/components/exchange/CancelLoadDialog';
import styles from '@/components/nova/nova.module.css';

/** Путь груза по бирже — какие шаги впереди. */
const STEPS: { status: ExchangeLoad['status']; title: string; hint: string }[] = [
    { status: 'OPEN', title: 'Ищем машину', hint: 'Груз виден водителям' },
    { status: 'TAKEN', title: 'Водитель найден', hint: 'Едет на погрузку' },
    { status: 'IN_TRANSIT', title: 'В пути', hint: 'Погрузились, везут' },
    { status: 'DELIVERED', title: 'Доставлен', hint: 'Водитель отметит доставку' },
];

export default function ExchangeLoadPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [load, setLoad] = useState<ExchangeLoad | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);

    const reload = useCallback(() => {
        api.get(`/exchange/loads/${id}`)
            .then((r) => setLoad(r.data))
            .catch((e) => setFailed(e?.response?.status === 404 ? 'Груз не найден' : 'Не удалось загрузить груз. Обновите страницу.'));
    }, [id]);

    useEffect(() => { reload(); }, [reload]);

    const back = (
        <Button variant="outline" onClick={() => router.push('/company/exchange')}>
            <ArrowLeft className="h-4 w-4" /> К бирже
        </Button>
    );

    if (failed || !load) {
        return (
            <div className={styles.page}>
                <div className={styles.hero}>
                    <div>
                        <div className={styles.eyebrow}>Биржа</div>
                        <h1 className={styles.title}>{failed ? 'Груз' : 'Загрузка…'}</h1>
                    </div>
                    <div className={styles.heroActions}>{back}</div>
                </div>
                {failed ? <div className={styles.card}><div className={styles.empty}>{failed}</div></div> : <div className={`${styles.card} h-64 animate-pulse`} />}
            </div>
        );
    }

    const isOpen = load.status === 'OPEN';
    /** Когда шаг случился — вместо подсказки показываем время. */
    const stepTime = (status: ExchangeLoad['status']) => ({
        OPEN: load.createdAt, TAKEN: load.takenAt, IN_TRANSIT: load.loadedAt, DELIVERED: load.deliveredAt, CANCELLED: null,
    } as Record<ExchangeLoad['status'], string | null>)[status];
    const cancelled = load.status === 'CANCELLED';
    const reached = STEPS.findIndex((s) => s.status === load.status);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа · груз {load.number}</div>
                    <h1 className={`${styles.title} flex flex-wrap items-center gap-2`}>
                        {load.originCityName} <ArrowRight className="h-6 w-6 text-muted-foreground" /> {load.destinationCityName}
                    </h1>
                    <p className={`${styles.subtitle} flex flex-wrap items-center gap-2`}>
                        <StatusPill status={load.status} label={EXCHANGE_LOAD_STATUS_LABELS[load.status]} />
                        <span>
                            поставлен {dayjs(load.createdAt).format('DD.MM.YYYY HH:mm')}
                            {load.createdByName ? ` · ${load.createdByName}` : ''}
                        </span>
                    </p>
                </div>
                <div className={styles.heroActions}>
                    {back}
                    {isOpen && (
                        <Button variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)}>
                            <X className="h-4 w-4" /> Снять с биржи
                        </Button>
                    )}
                </div>
            </div>

            {датаПрошла(load) && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-solid border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        День погрузки прошёл — водители этот груз уже не видят. Снимите его с биржи и поставьте заново с новой датой.
                    </span>
                </div>
            )}

            {cancelled && (
                <div className={styles.card}>
                    <div className={styles.cardBody}>
                        <p className="m-0 text-[13px]">
                            Снят с биржи {load.cancelledAt ? dayjs(load.cancelledAt).format('DD.MM.YYYY HH:mm') : ''}
                            {load.cancelReason ? ` — ${load.cancelReason}` : ''}.
                        </p>
                    </div>
                </div>
            )}

            {!cancelled && (
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <ListChecks size={14} />
                        <h2 className={styles.cardTitle}>Ход перевозки</h2>
                    </div>
                    <div className={styles.cardBody}>
                        <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-4">
                            {STEPS.map((s, i) => {
                                const done = i < reached || (i === reached && s.status === 'DELIVERED');
                                const now = i === reached && s.status !== 'DELIVERED';
                                return (
                                    <li
                                        key={s.status}
                                        aria-current={now ? 'step' : undefined}
                                        className={`rounded-xl border border-solid p-3 ${now ? 'border-foreground' : 'border-border'} ${i > reached ? 'opacity-50' : ''}`}
                                    >
                                        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                                            {done && <Check className="h-3.5 w-3.5" />}
                                            {s.title}
                                        </div>
                                        <div className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                                            {stepTime(s.status) ? dayjs(stepTime(s.status)!).format('DD.MM HH:mm') : s.hint}
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                        {isOpen && !датаПрошла(load) && (
                            <p className="m-0 mt-3 text-[12px] text-muted-foreground">
                                Груз виден допущенным водителям в приложении. Кто первым нажмёт «Беру», тот и повезёт — его имя и телефон появятся здесь.
                            </p>
                        )}
                    </div>
                </section>
            )}

            {load.driver && (
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <UserRound size={14} />
                        <h2 className={styles.cardTitle}>Кто везёт</h2>
                    </div>
                    <div className={`${styles.cardBody} flex flex-wrap items-start justify-between gap-4`}>
                        <div className="space-y-2 text-[13px]">
                            <div className="text-[15px] font-semibold">
                                {[load.driver.lastName, load.driver.firstName, load.driver.middleName].filter(Boolean).join(' ') || 'Водитель'}
                            </div>
                            <Row label="Машина" value={[load.driver.vehiclePlate, load.driver.vehicleBodyType].filter(Boolean).join(' · ') || '—'} />
                            <Row label="Работает" value={load.driver.kind === 'IP' ? 'свой ИП' : load.driver.park ? `через парк ${вКавычках(load.driver.park.name)}` : '—'} />
                        </div>
                        {load.driver.phone && (
                            <a
                                href={`tel:${load.driver.phone}`}
                                aria-label={`Позвонить водителю ${телефонКрасиво(load.driver.phone)}`}
                                className="inline-flex h-9 items-center gap-2 rounded-xl border border-solid border-border bg-background px-3 text-[13px] font-medium text-foreground no-underline hover:bg-muted/50"
                            >
                                <Phone className="h-4 w-4" /> <span className="tabular-nums">{телефонКрасиво(load.driver.phone)}</span>
                            </a>
                        )}
                    </div>
                </section>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <Truck size={14} />
                        <h2 className={styles.cardTitle}>Маршрут и погрузка</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-2 text-[13px]`}>
                        <Row label="Откуда" value={[load.originCityName, load.originAddress].filter(Boolean).join(', ')} />
                        <Row label="Куда" value={[load.destinationCityName, load.destinationAddress].filter(Boolean).join(', ')} />
                        <Row label="Погрузка" value={когдаПогрузка(load)} />
                    </div>
                </section>

                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <Package size={14} />
                        <h2 className={styles.cardTitle}>Груз и цена</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-2 text-[13px]`}>
                        <div className="pb-1">
                            <div className="text-[12px] text-muted-foreground">Цена перевозки</div>
                            <div className="text-[24px] font-bold leading-tight tabular-nums">{moneyShort(load.price)}</div>
                        </div>
                        <Row label="Что везём" value={load.cargoDescription} />
                        <Row label="Кузов" value={load.bodyType} />
                        <Row label="Вес и объём" value={[тонн(load.weightKg), load.volumeM3 ? `${load.volumeM3} м³` : null].filter(Boolean).join(' · ') || '—'} />
                        {load.requirements && <Row label="Важно водителю" value={load.requirements} />}
                    </div>
                </section>
            </div>

            {(load.photos.length > 0 || isOpen) && (
                <section className={styles.card} style={{ marginTop: 16 }}>
                    <div className={styles.cardHead}>
                        <Images size={14} />
                        <h2 className={styles.cardTitle}>Фото груза</h2>
                    </div>
                    <div className={styles.cardBody}>
                        <LoadPhotos load={load} editable={isOpen} onChanged={reload} />
                    </div>
                </section>
            )}

            <CancelLoadDialog load={load} open={cancelOpen} onOpenChange={setCancelOpen} onDone={reload} />
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="whitespace-pre-wrap">{value || '—'}</span>
        </div>
    );
}
