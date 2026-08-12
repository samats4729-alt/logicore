'use client';

import { useState } from 'react';
import { InputNumber, Select } from 'antd';
import { BadgeCheck, CircleAlert, Loader2, Receipt } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
    INVOICE_TIMINGS,
    PAYMENT_ANCHORS,
    anchorLabel,
    invoiceTimingLabel,
    paymentTermsLabel,
    vatLabel,
    type OrderSettlements,
    type SettlementSide,
} from '@/lib/settlement-terms';
import { VAT_RATES } from '@/lib/tax';
import nova from '@/components/nova/nova.module.css';

/**
 * Расчёты по рейсу — рабочее место бухгалтера.
 *
 * Здесь собрано то, что раньше было раскидано по форме заявки: НДС обеих
 * сторон и сроки оплаты. Значения приходят из карточек контрагентов, где их
 * один раз заполнил бухгалтер, — а здесь он видит, что подставилось, и при
 * необходимости правит по конкретному рейсу.
 *
 * Пока расчёты не проверены, договор-заявку нельзя заверить печатью, счёт —
 * выставить, а контрагент видит рейс без налоговой части. Проверка ставится
 * сама, когда в карточках всё заполнено: она нужна для исключений, а не для
 * того, чтобы жать кнопку на каждом рейсе.
 */

const dateLabel = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY') : null);

/** Одна сторона: кто, с НДС или без, когда платит. */
function SideRow({ title, side, payVerb }: { title: string; side: SettlementSide; payVerb: string }) {
    const terms = paymentTermsLabel(side.days, side.from);
    const due = dateLabel(side.dueDate);
    return (
        <div className={nova.item}>
            <span className={nova.itemIcon}><Receipt size={14} /></span>
            <span className={nova.itemText}>
                <span className={nova.itemLabel}>
                    {title}{side.name ? ` · ${side.name}` : ''}
                </span>
                <span className={nova.itemDesc}>
                    {vatLabel(side.vatPayer, side.vatRate)}
                    {terms ? ` · ${payVerb} ${terms}` : ' · срок оплаты не указан'}
                    {due && ` · до ${due}`}
                    {!due && side.dueDependsOn && ` · дату посчитаем после ${side.dueDependsOn}`}
                </span>
            </span>
        </div>
    );
}

export default function OrderSettlementsCard({
    orderId,
    settlements,
    mayAccount,
    onChanged,
}: {
    orderId: string;
    settlements: OrderSettlements | null;
    /** Право «Бухгалтерия»: без него блок только читают. */
    mayAccount: boolean;
    onChanged: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<any>(null);

    if (!settlements) return null;

    const { customer, carrier } = settlements;
    const hasSides = !!customer.companyId || !!carrier.companyId;

    const startEdit = () => {
        setDraft({
            hasVat: customer.vatPayer ?? false,
            vatRate: customer.vatRate ?? 0,
            executorHasVat: carrier.vatPayer ?? false,
            executorVatRate: carrier.vatRate ?? 0,
            customerPaymentDays: customer.days,
            customerPaymentFrom: customer.from,
            carrierPaymentDays: carrier.days,
            carrierPaymentFrom: carrier.from,
        });
        setEditing(true);
    };

    const save = async () => {
        try {
            setBusy(true);
            await api.put(`/orders/${orderId}/settlements`, draft);
            toast.success('Расчёты по рейсу сохранены и проверены');
            setEditing(false);
            onChanged();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось сохранить расчёты');
        } finally {
            setBusy(false);
        }
    };

    const confirm = async () => {
        try {
            setBusy(true);
            await api.post(`/orders/${orderId}/settlements/confirm`);
            toast.success('Расчёты подтверждены — договор можно заверять, счёт выставлять');
            onChanged();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось подтвердить расчёты');
        } finally {
            setBusy(false);
        }
    };

    /** Откуда взялась отметка проверки — на экране это разные вещи. */
    const confirmedNote = settlements.source === 'PERSON'
        ? `Проверил${settlements.confirmedByName ? `: ${settlements.confirmedByName}` : ''}`
            + `${settlements.confirmedAt ? `, ${dayjs(settlements.confirmedAt).format('DD.MM.YYYY')}` : ''}`
        : settlements.source === 'CARDS'
            ? 'Условия взяты из карточек контрагентов'
            : settlements.source === 'LEGACY'
                ? 'Заявка заведена до появления проверки — приняты как есть'
                : null;

    return (
        <section className={nova.card} style={{ marginBottom: 14 }}>
            <div className={nova.cardHead}>
                {settlements.confirmed ? <BadgeCheck size={14} /> : <CircleAlert size={14} />}
                <h2 className={nova.cardTitle}>Расчёты по рейсу</h2>
                <span className={nova.chip}>
                    {settlements.confirmed ? 'проверено' : 'ждёт проверки'}
                </span>
            </div>

            <div className={nova.cardBody}>
                {!hasSides && (
                    <div className={nova.empty}>
                        В рейсе пока нет ни заказчика, ни перевозчика — рассчитываться не с кем.
                    </div>
                )}

                {hasSides && !editing && (
                    <>
                        <div className={nova.list}>
                            {customer.companyId && (
                                <SideRow title="Заказчик" side={customer} payVerb="платит" />
                            )}
                            {carrier.companyId && (
                                <SideRow title="Перевозчик" side={carrier} payVerb="платим" />
                            )}
                        </div>

                        {settlements.invoiceTiming && (
                            <div className={nova.itemDesc} style={{ marginTop: 8 }}>
                                Счёт заказчику выставляем: {invoiceTimingLabel(settlements.invoiceTiming)}
                            </div>
                        )}

                        {settlements.missing.length > 0 && (
                            <div className={nova.itemDesc} style={{ marginTop: 10, lineHeight: 1.5 }}>
                                {settlements.missing.map((line) => <div key={line}>• {line}</div>)}
                                <div style={{ marginTop: 4 }}>
                                    Пока это не заполнено, договор нельзя заверить печатью, а счёт —
                                    выставить.
                                </div>
                            </div>
                        )}

                        {confirmedNote && (
                            <div className={nova.itemDesc} style={{ marginTop: 8 }}>{confirmedNote}</div>
                        )}

                        {mayAccount && (
                            <div className={nova.heroActions} style={{ marginTop: 12 }}>
                                {!settlements.confirmed && (
                                    <button
                                        type="button"
                                        className={`${nova.action} ${nova.actionPrimary}`}
                                        onClick={() => !busy && confirm()}
                                    >
                                        {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                                        Подтвердить расчёты
                                    </button>
                                )}
                                <button type="button" className={nova.action} onClick={startEdit}>
                                    Исправить
                                </button>
                            </div>
                        )}
                    </>
                )}

                {editing && draft && (
                    <div style={{ display: 'grid', gap: 14 }}>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <b style={{ fontSize: 13 }}>Заказчик{customer.name ? ` · ${customer.name}` : ''}</b>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Select
                                    style={{ width: 140 }}
                                    value={draft.hasVat}
                                    onChange={(v) => setDraft({ ...draft, hasVat: v })}
                                    options={[{ value: false, label: 'Без НДС' }, { value: true, label: 'С НДС' }]}
                                />
                                {draft.hasVat && (
                                    <Select
                                        style={{ width: 120 }}
                                        value={draft.vatRate}
                                        onChange={(v) => setDraft({ ...draft, vatRate: v })}
                                        options={VAT_RATES.map((r) => ({ value: r.value, label: r.label }))}
                                    />
                                )}
                                <InputNumber
                                    style={{ width: 130 }}
                                    min={0}
                                    max={365}
                                    placeholder="дней"
                                    value={draft.customerPaymentDays}
                                    onChange={(v) => setDraft({ ...draft, customerPaymentDays: v })}
                                    addonAfter="дн."
                                />
                                <Select
                                    style={{ width: 230 }}
                                    allowClear
                                    placeholder="от какого дня считать"
                                    value={draft.customerPaymentFrom}
                                    onChange={(v) => setDraft({ ...draft, customerPaymentFrom: v ?? null })}
                                    options={PAYMENT_ANCHORS.map((a) => ({ value: a.value, label: a.label }))}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: 8 }}>
                            <b style={{ fontSize: 13 }}>Перевозчик{carrier.name ? ` · ${carrier.name}` : ''}</b>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Select
                                    style={{ width: 140 }}
                                    value={draft.executorHasVat}
                                    onChange={(v) => setDraft({ ...draft, executorHasVat: v })}
                                    options={[{ value: false, label: 'Без НДС' }, { value: true, label: 'С НДС' }]}
                                />
                                {draft.executorHasVat && (
                                    <Select
                                        style={{ width: 120 }}
                                        value={draft.executorVatRate}
                                        onChange={(v) => setDraft({ ...draft, executorVatRate: v })}
                                        options={VAT_RATES.map((r) => ({ value: r.value, label: r.label }))}
                                    />
                                )}
                                <InputNumber
                                    style={{ width: 130 }}
                                    min={0}
                                    max={365}
                                    placeholder="дней"
                                    value={draft.carrierPaymentDays}
                                    onChange={(v) => setDraft({ ...draft, carrierPaymentDays: v })}
                                    addonAfter="дн."
                                />
                                <Select
                                    style={{ width: 230 }}
                                    allowClear
                                    placeholder="от какого дня считать"
                                    value={draft.carrierPaymentFrom}
                                    onChange={(v) => setDraft({ ...draft, carrierPaymentFrom: v ?? null })}
                                    options={PAYMENT_ANCHORS.map((a) => ({ value: a.value, label: a.label }))}
                                />
                            </div>
                        </div>

                        <div className={nova.itemDesc}>
                            Правка касается только этого рейса. Чтобы так было со всеми рейсами
                            контрагента, поправьте его карточку — раздел «Расчёты».
                        </div>

                        <div className={nova.heroActions}>
                            <button
                                type="button"
                                className={`${nova.action} ${nova.actionPrimary}`}
                                onClick={() => !busy && save()}
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                                Сохранить и проверить
                            </button>
                            <button type="button" className={nova.action} onClick={() => setEditing(false)}>
                                Отмена
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
