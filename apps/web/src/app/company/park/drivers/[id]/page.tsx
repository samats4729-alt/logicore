'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { ArrowLeft, Ban, Check, Download, FileSignature, Images, Loader2, Truck, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { EXCHANGE_DRIVER_STATUS_LABELS } from '@/lib/vocabulary';
import { ExchangeDriver, ответСервера, иинКрасиво, фиоВодителя, телефонКрасиво } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import StatusPill from '@/components/ui/StatusPill';
import { DriverDocuments } from '@/components/exchange/DriverDocuments';
import { DriverVehicles } from '@/components/exchange/DriverVehicles';
import { DriverDecisionDialog } from '@/components/exchange/DriverDecisionDialog';
import styles from '@/components/nova/nova.module.css';
import { VehicleOwnerContracts } from '@/components/exchange/VehicleOwnerContracts';

/**
 * Анкета водителя — для проверки парком.
 *
 * Порядок проверки сверху вниз: кто это (ИИН, телефон — позвонить), машина,
 * фото документов. Решение — кнопки в шапке: допустить, отказать с причиной,
 * заблокировать за обман.
 */
export default function ParkDriverPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [driver, setDriver] = useState<ExchangeDriver | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [decision, setDecision] = useState<'reject' | 'block' | null>(null);
    const [approving, setApproving] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const reload = useCallback(() => {
        api.get(`/exchange/park/drivers/${id}`)
            .then((r) => setDriver(r.data))
            .catch((e) => setFailed(e?.response?.status === 404 ? 'Водитель не найден' : 'Не удалось загрузить анкету. Обновите страницу.'));
    }, [id]);
    useEffect(() => { reload(); }, [reload]);

    const approve = async () => {
        if (!driver) return;
        setApproving(true);
        try {
            await api.post(`/exchange/park/drivers/${driver.id}/approve`);
            toast.success(`${фиоВодителя(driver)} допущен к грузам`);
            reload();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось допустить'));
        } finally {
            setApproving(false);
        }
    };

    /** Подписанный экземпляр в PDF — с печатью и подписью парка из «Печать и подпись». */
    const downloadContract = async () => {
        if (!driver?.contract) return;
        setDownloading(true);
        try {
            const res = await api.get(`/exchange/park/drivers/${driver.id}/contract/pdf`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `Договор ${driver.contract.number}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось скачать договор'));
        } finally {
            setDownloading(false);
        }
    };

    const back = (
        <Button variant="outline" onClick={() => router.push('/company/park/drivers')}>
            <ArrowLeft className="h-4 w-4" /> К водителям
        </Button>
    );

    if (failed || !driver) {
        return (
            <div className={styles.page}>
                <div className={styles.hero}>
                    <div>
                        <div className={styles.eyebrow}>Кабинет парка</div>
                        <h1 className={styles.title}>{failed ? 'Водитель' : 'Загрузка…'}</h1>
                    </div>
                    <div className={styles.heroActions}>{back}</div>
                </div>
                {failed ? <div className={styles.card}><div className={styles.empty}>{failed}</div></div> : <div className={`${styles.card} h-64 animate-pulse`} />}
            </div>
        );
    }

    const pending = driver.status === 'PENDING';

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет парка · анкета водителя</div>
                    <h1 className={styles.title}>{фиоВодителя(driver)}</h1>
                    <p className={`${styles.subtitle} flex flex-wrap items-center gap-2`}>
                        <StatusPill status={driver.status} label={EXCHANGE_DRIVER_STATUS_LABELS[driver.status]} />
                        {driver.submittedAt && <span>подана {dayjs(driver.submittedAt).format('DD.MM.YYYY HH:mm')}</span>}
                    </p>
                </div>
                <div className={styles.heroActions}>
                    {back}
                    {pending && (
                        <>
                            <Button variant="outline" onClick={() => setDecision('reject')}>
                                <X className="h-4 w-4" /> Отказать
                            </Button>
                            <Button onClick={approve} disabled={approving}>
                                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Допустить к грузам
                            </Button>
                        </>
                    )}
                    {driver.status !== 'BLOCKED' && (
                        <Button variant="outline" className="text-destructive" onClick={() => setDecision('block')}>
                            <Ban className="h-4 w-4" /> Заблокировать
                        </Button>
                    )}
                </div>
            </div>

            {(driver.rejectReason && driver.status === 'REJECTED') && (
                <div className={styles.card}><div className={`${styles.cardBody} text-[13px]`}>Отказ: {driver.rejectReason}. Водитель может исправить анкету и отправить снова.</div></div>
            )}
            {driver.status === 'BLOCKED' && (
                <div className={styles.card}><div className={`${styles.cardBody} text-[13px]`}>
                    Заблокирован {driver.blockedAt ? dayjs(driver.blockedAt).format('DD.MM.YYYY') : ''}{driver.blockedReason ? ` — ${driver.blockedReason}` : ''}. ИИН, телефон и номер машины в чёрном списке биржи.
                </div></div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <UserRound size={14} />
                        <h2 className={styles.cardTitle}>Кто это</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-2 text-[13px]`}>
                        <Row label="ФИО" value={фиоВодителя(driver)} />
                        <Row label="ИИН" value={иинКрасиво(driver.iin)} />
                        <Row label="Дата рождения" value={driver.birthDate ? `${dayjs(driver.birthDate).format('DD.MM.YYYY')} (по ИИН)` : '—'} />
                        {/* Удостоверение — сверить с фото ниже и вписать в договор. */}
                        <Row label="Удостоверение" value={driver.idNumber ? `№ ${driver.idNumber}${driver.idIssuedBy ? `, ${driver.idIssuedBy}` : ''}` : '—'} />
                        {(driver.idIssuedAt || driver.idExpiresAt) && (
                            <Row
                                label="Выдано / действует"
                                value={`${driver.idIssuedAt ? dayjs(driver.idIssuedAt).format('DD.MM.YYYY') : '—'} — ${driver.idExpiresAt ? `до ${dayjs(driver.idExpiresAt).format('DD.MM.YYYY')}` : 'срок не указан'}`}
                            />
                        )}
                        <Row label="Адрес прописки" value={driver.registrationAddress || '—'} />
                        <Row label="Телефон" value={driver.phone ? <a className="lc-link" href={`tel:${driver.phone}`}>{телефонКрасиво(driver.phone)}</a> : '—'} />
                        {/* Второй, третий, зарубежный — водитель добавляет сам, без проверки (Q6). */}
                        {!!driver.extraPhones?.length && (
                            <Row
                                label="Ещё номера"
                                value={driver.extraPhones.map((p, i) => (
                                    <span key={p}>{i > 0 && ', '}<a className="lc-link" href={`tel:${p}`}>{телефонКрасиво(p)}</a></span>
                                ))}
                            />
                        )}
                        {(driver.docsEmail || driver.docsContact) && (
                            <Row label="Для документов" value={[driver.docsEmail, driver.docsContact].filter(Boolean).join(' · ')} />
                        )}
                        <Row label="Почта Google" value={driver.email || '—'} />
                        <Row label="Рейсов довёз" value={String(driver.tripsCompleted)} />
                        {/* Без согласия анкету не отправить (с 09.10.2026); у поданных
                            раньше его может не быть — так и пишем. */}
                        <Row label="Согласие на данные" value={driver.consentAt ? `дано ${dayjs(driver.consentAt).format('DD.MM.YYYY HH:mm')}` : 'не давал'} />
                    </div>
                </section>

                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <Truck size={14} />
                        <h2 className={styles.cardTitle}>Машина</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-2 text-[13px]`}>
                        <Row label="Марка и модель" value={driver.vehicleModel || '—'} />
                        <Row label="Госномер" value={driver.vehiclePlate || '—'} />
                        <Row label="Техпаспорт" value={driver.vehicleRegNumber ? `№ ${driver.vehicleRegNumber}` : '—'} />
                        <Row label="Кузов" value={driver.vehicleBodyType || '—'} />
                        <Row label="Грузоподъёмность" value={driver.vehicleCapacityKg ? `${driver.vehicleCapacityKg / 1000} т` : '—'} />
                        <Row label="Владелец" value={driver.vehicleIsOwn ? 'сам водитель' : 'другой человек — нужен договор с владельцем (ниже)'} />
                        <DriverVehicles driverId={driver.id} />
                    </div>
                </section>
            </div>

            <section className={styles.card} style={{ marginTop: 16 }}>
                <div className={styles.cardHead}>
                    <Images size={14} />
                    <h2 className={styles.cardTitle}>Фото документов</h2>
                </div>
                <div className={styles.cardBody}>
                    <DriverDocuments driver={driver} />
                </div>
            </section>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <FileSignature size={14} />
                    <h2 className={styles.cardTitle}>Договор с парком</h2>
                </div>
                <div className={`${styles.cardBody} flex flex-wrap items-center justify-between gap-3 text-[13px]`}>
                    {/* Полный текст, подписанный водителем, хранится неизменным; PDF
                        собирается из него с печатью и подписью парка. */}
                    <span>
                        {driver.contract
                            ? `№ ${driver.contract.number}, подписан водителем в приложении ${dayjs(driver.contract.signedAt).format('DD.MM.YYYY HH:mm')}. Подпись через eGov подключим отдельно.`
                            : driver.contractSignedAt
                                ? `Подписан в приложении ${dayjs(driver.contractSignedAt).format('DD.MM.YYYY HH:mm')} — до появления полного текста договора, экземпляра нет. Попросите водителя подписать заново.`
                                : 'Не подписан.'}
                    </span>
                    {driver.contract && (
                        <Button variant="outline" size="sm" onClick={downloadContract} disabled={downloading}>
                            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Скачать договор (PDF)
                        </Button>
                    )}
                </div>
            </section>

            {/* Машина не водителя — парк арендует её у владельца отдельным договором (Q9). */}
            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Truck size={14} />
                    <h2 className={styles.cardTitle}>Договор с владельцем машины</h2>
                </div>
                <div className={styles.cardBody}>
                    <VehicleOwnerContracts driverId={driver.id} />
                </div>
            </section>

            <DriverDecisionDialog driver={driver} mode={decision} onClose={() => setDecision(null)} onDone={reload} />
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
