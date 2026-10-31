'use client';

import { useState } from 'react';
import { InputNumber, Select } from 'antd';
import { BadgeCheck, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
    INVOICE_TIMINGS,
    PAYMENT_ANCHORS,
    anchorLabel,
    invoiceTimingLabel,
    paymentTermsLabel,
    DAY_KINDS,
    vatLabel,
    type OrderSettlements,
    type SettlementSide,
} from '@/lib/settlement-terms';
import { VAT_RATES } from '@/lib/tax';
import nova from '@/components/nova/nova.module.css';
import { cn } from '@/lib/utils';
import card from './order-card.module.css';

/**
 * Расчёты по рейсу — рабочее место бухгалтера.
 *
 * Здесь собрано то, что раньше было раскидано по форме заявки: НДС обеих
 * сторон и сроки оплаты. Значения приходят из карточек контрагентов, где их
 * один раз заполнил бухгалтер, — а здесь он видит, что подставилось, и при
 * необходимости правит по конкретному рейсу.
 *
 * Пока расчёты не проверены, счёт не выставить, а контрагент видит рейс без
 * налоговой части. Договор-заявку это не держит: её проводят независимо от
 * расчётов (просьба бухгалтера, 02.10.2026). Проверка ставится
 * сама, когда в карточках всё заполнено: она нужна для исключений, а не для
 * того, чтобы жать кнопку на каждом рейсе.
 */

const dateLabel = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY') : null);

const fmt = (n: number) => n.toLocaleString('ru-RU');

/**
 * Деньги стороны по рейсу — из сводки заявки: ставка с НДС и без, сальдо,
 * отметка об оплате, условия и форма оплаты из самой заявки. Считает
 * сервер; здесь только показ рядом с условиями расчётов.
 */
export interface SideMoney {
    /** Подпись строки, если не «Заказчик» / «Перевозчик»: заказчику — «Экспедитор». */
    title?: string;
    name?: string | null;
    gross: number;
    net: number;
    vat: number;
    vatRate: number;
    debt: number;
    paid: boolean;
    /** «Дт» — заплатить должны нам, «Кт» — платим мы. */
    sign: 'Дт' | 'Кт';
    /** Условия и форма оплаты, записанные в заявке. */
    conditions: string[];
    onPay?: () => void;
}

/** Одна сторона строкой: кто, ставка, оплачено, сальдо, условия, оплата. */
function SideRow({ title, side, money, payVerb }: {
    title: string;
    side?: SettlementSide | null;
    money?: SideMoney;
    payVerb: string;
}) {
    const terms = side ? paymentTermsLabel(side.days, side.from, side.banking) : null;
    const due = side ? dateLabel(side.dueDate) : null;
    const paidSum = money ? Math.max(0, money.gross - money.debt) : 0;
    return (
        <div className={card.sideRow}>
            <span>
                <b style={{ fontWeight: 500 }}>{money?.title || title}</b>
                <span className={card.muted}> · {money?.name || side?.name || '—'}</span>
            </span>
            <span className={card.n}>
                {money ? (
                    <>
                        {fmt(money.gross)} ₸
                        {/* Без НДС — одна строка: три одинаковые суммы «с НДС»,
                            «без НДС» и «НДС 0 %» сбивали с толку (владелец, 29.10.2026). */}
                        <span className={card.sub}>
                            {money.vat || money.vatRate
                                ? `без НДС ${fmt(money.net)} · НДС ${money.vatRate}% ${fmt(money.vat)}`
                                : 'без НДС'}
                        </span>
                    </>
                ) : '—'}
            </span>
            <span className={card.n}>
                {money ? (
                    <>
                        {fmt(paidSum)} ₸
                        <span className={card.sub}>{money.paid ? 'оплачено' : 'не оплачено'}</span>
                    </>
                ) : '—'}
            </span>
            <span className={card.n}>
                {/* Красным — только непогашенный остаток: ноль — хорошая новость. */}
                {money ? (money.debt > 0 ? <b className={card.neg}>{money.sign} {fmt(money.debt)} ₸</b> : '0 ₸') : '—'}
            </span>
            <span className={card.sideTerms}>
                {side && (
                    <>
                        {vatLabel(side.vatPayer, side.vatRate)}
                        {terms ? ` · ${payVerb} ${terms}` : ' · срок оплаты не указан'}
                        {due && ` · до ${due}`}
                        {!due && side.dueDependsOn && ` · дату посчитаем после ${side.dueDependsOn}`}
                    </>
                )}
                {money?.conditions.length ? <span className={card.sub}>{money.conditions.join(' · ')}</span> : null}
            </span>
            <span className={card.n}>
                {money?.onPay && (
                    <button type="button" className={card.lnk} onClick={money.onPay}>Внести оплату</button>
                )}
            </span>
        </div>
    );
}

export default function OrderSettlementsCard({
    orderId,
    settlements,
    mayAccount,
    onChanged,
    money,
    title = 'Расчёты по рейсу',
}: {
    orderId: string;
    settlements: OrderSettlements | null;
    /** Право «Бухгалтерия»: без него блок только читают. */
    mayAccount: boolean;
    onChanged: () => void;
    /** Ставки, оплата и сальдо сторон — строкой рядом с условиями. */
    money?: { customer?: SideMoney; carrier?: SideMoney };
    title?: string;
}) {
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<any>(null);

    const showCustomer = !!settlements?.customer.companyId || !!money?.customer;
    const showCarrier = !!settlements?.carrier.companyId || !!money?.carrier;
    if (!settlements && !showCustomer && !showCarrier) return null;

    const customer = settlements?.customer ?? null;
    const carrier = settlements?.carrier ?? null;
    const hasSides = showCustomer || showCarrier;

    const startEdit = () => {
        if (!customer || !carrier) return;
        setDraft({
            hasVat: customer.vatPayer ?? false,
            vatRate: customer.vatRate ?? 0,
            executorHasVat: carrier.vatPayer ?? false,
            executorVatRate: carrier.vatRate ?? 0,
            customerPaymentDays: customer.days,
            customerPaymentFrom: customer.from,
            carrierPaymentDays: carrier.days,
            carrierPaymentFrom: carrier.from,
            customerPaymentBanking: !!customer.banking,
            carrierPaymentBanking: !!carrier.banking,
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
    const confirmedNote = settlements?.source === 'PERSON'
        ? `Проверил${settlements.confirmedByName ? `: ${settlements.confirmedByName}` : ''}`
            + `${settlements.confirmedAt ? `, ${dayjs(settlements.confirmedAt).format('DD.MM.YYYY')}` : ''}`
        : settlements?.source === 'CARDS'
            ? 'Условия взяты из карточек контрагентов'
            : settlements?.source === 'LEGACY'
                ? 'Заявка заведена до появления проверки — приняты как есть'
                : null;

    return (
        <section className={card.section} aria-label={title}>
            <h2 className={card.head}>
                {title}
                {settlements && (
                    <span className={cn(card.tag, !settlements.confirmed && card.tagWarn)}>
                        {settlements.confirmed ? 'проверено' : 'ждёт проверки'}
                    </span>
                )}
                {settlements && !editing && (
                    <span className={card.headRight}>
                        {confirmedNote}
                        {mayAccount && (
                            <button type="button" className={card.lnk} onClick={startEdit}>Исправить</button>
                        )}
                    </span>
                )}
            </h2>

            <div>
                {!hasSides && (
                    <div className={cn(card.list, card.empty)}>
                        В рейсе пока нет ни заказчика, ни перевозчика — рассчитываться не с кем.
                    </div>
                )}

                {hasSides && !editing && (
                    <>
                        <div className={card.scroll}>
                            <div className={cn(card.list, card.sides)}>
                                <div className={cn(card.sideRow, card.sideHead)}>
                                    <span>Сторона</span>
                                    <span className={card.n}>Ставка</span>
                                    <span className={card.n}>Оплачено</span>
                                    <span className={card.n}>Сальдо</span>
                                    <span style={{ paddingLeft: 8 }}>Срок и условия</span>
                                    <span />
                                </div>
                                {showCustomer && (
                                    <SideRow title="Заказчик" side={customer} money={money?.customer} payVerb="платит" />
                                )}
                                {showCarrier && (
                                    <SideRow title="Перевозчик" side={carrier} money={money?.carrier} payVerb="платим" />
                                )}
                            </div>
                        </div>

                        {settlements?.invoiceTiming && (
                            <p className={card.note}>
                                Счёт заказчику выставляем: {invoiceTimingLabel(settlements.invoiceTiming)}
                            </p>
                        )}

                        {settlements && settlements.missing.length > 0 && (
                            <div className={`${card.ask} ${card.askNeed}`} style={{ marginTop: 12, marginBottom: 0 }}>
                                <span className={cn(card.dot, card.dotNeed)} aria-hidden />
                                <span style={{ fontSize: 13 }}>
                                    {settlements.missing.map((line) => <div key={line}>{line}</div>)}
                                    <span className={card.muted}>
                                        Пока это не заполнено, договор нельзя заверить печатью, а счёт — выставить.
                                    </span>
                                </span>
                                <span />
                            </div>
                        )}

                        {settlements && mayAccount && !settlements.confirmed && (
                            <div className={nova.heroActions} style={{ marginTop: 12 }}>
                                <button
                                    type="button"
                                    className={`${nova.action} ${nova.actionPrimary}`}
                                    onClick={() => !busy && confirm()}
                                >
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                                    Подтвердить расчёты
                                </button>
                            </div>
                        )}
                    </>
                )}

                {editing && draft && (
                    <div style={{ display: 'grid', gap: 14 }}>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <b style={{ fontSize: 13 }}>Заказчик{customer?.name ? ` · ${customer.name}` : ''}</b>
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
                                    style={{ width: 150 }}
                                    aria-label="Какие дни"
                                    value={!!draft.customerPaymentBanking}
                                    onChange={(v) => setDraft({ ...draft, customerPaymentBanking: v })}
                                    options={DAY_KINDS}
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
                            <b style={{ fontSize: 13 }}>Перевозчик{carrier?.name ? ` · ${carrier.name}` : ''}</b>
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
                                    style={{ width: 150 }}
                                    aria-label="Какие дни"
                                    value={!!draft.carrierPaymentBanking}
                                    onChange={(v) => setDraft({ ...draft, carrierPaymentBanking: v })}
                                    options={DAY_KINDS}
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
