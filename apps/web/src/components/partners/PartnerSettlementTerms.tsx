'use client';

import { useEffect, useState } from 'react';
import { InputNumber, Select } from 'antd';
import { BadgeCheck, CircleAlert, Loader2, Receipt, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { INVOICE_TIMINGS, PAYMENT_ANCHORS } from '@/lib/settlement-terms';
import { VAT_RATES } from '@/lib/tax';
import nova from '@/components/nova/nova.module.css';

/**
 * Условия расчётов с контрагентом — то, что заполняет бухгалтер один раз.
 *
 * До этого таких полей не было вовсе: работает контрагент с НДС или нет,
 * решали заново в каждой заявке, и решал менеджер, который про НДС не знает.
 * Срок оплаты жил свободной строкой, из которой нельзя посчитать ни одной
 * даты, поэтому в договор печаталось «15 Календарных дней» независимо от
 * договорённости.
 *
 * Поля разделены по сторонам, потому что счёт заказчику выставляем мы, а
 * перевозчик выставляет его нам: у одного и того же контрагента условия по
 * этим двум сторонам разные. Показываем только те, которыми он и является —
 * галочки «Заказчик» и «Перевозчик» в его карточке.
 */

interface Terms {
    vatPayer: boolean | null;
    vatRate: number | null;
    invoiceTiming: string | null;
    customerPaymentDays: number | null;
    customerPaymentFrom: string | null;
    carrierPaymentDays: number | null;
    carrierPaymentFrom: string | null;
}

const VAT_OPTIONS = [
    { value: 'UNKNOWN', label: 'Не выяснено' },
    { value: 'YES', label: 'Работает с НДС' },
    { value: 'NO', label: 'Работает без НДС' },
];

export default function PartnerSettlementTerms({
    partner,
    canEdit,
    onSaved,
}: {
    partner: any;
    /** Право «Бухгалтерия». Без него условия видны, но не правятся. */
    canEdit: boolean;
    onSaved: (terms: Terms) => void;
}) {
    /**
     * Компания, работающая на платформе, — не наша карточка.
     *
     * Условия расчётов — это наша договорённость с контрагентом, и хранить её
     * в чужой организации нельзя: у неё свои договорённости с другими. Для
     * таких сторон условия задаёт бухгалтер в самой заявке, и до тех пор рейс
     * ждёт его — то есть работает та же защита, а не пустота.
     */
    const isDirectoryCard = partner?.isExternal !== false;
    const [draft, setDraft] = useState<Terms>({
        vatPayer: null, vatRate: null, invoiceTiming: null,
        customerPaymentDays: null, customerPaymentFrom: null,
        carrierPaymentDays: null, carrierPaymentFrom: null,
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft({
            vatPayer: partner?.vatPayer ?? null,
            vatRate: partner?.vatRate != null ? Number(partner.vatRate) : null,
            invoiceTiming: partner?.invoiceTiming ?? null,
            customerPaymentDays: partner?.customerPaymentDays ?? null,
            customerPaymentFrom: partner?.customerPaymentFrom ?? null,
            carrierPaymentDays: partner?.carrierPaymentDays ?? null,
            carrierPaymentFrom: partner?.carrierPaymentFrom ?? null,
        });
    }, [partner]);

    const vatValue = draft.vatPayer === null ? 'UNKNOWN' : draft.vatPayer ? 'YES' : 'NO';

    const save = async () => {
        try {
            setSaving(true);
            const res = await api.patch(`/external-companies/${partner.id}/settlement-terms`, {
                vatPayer: draft.vatPayer,
                vatRate: draft.vatPayer ? draft.vatRate ?? 0 : null,
                invoiceTiming: draft.invoiceTiming,
                customerPaymentDays: draft.customerPaymentDays,
                customerPaymentFrom: draft.customerPaymentFrom,
                carrierPaymentDays: draft.carrierPaymentDays,
                carrierPaymentFrom: draft.carrierPaymentFrom,
            });
            toast.success('Условия расчётов сохранены — новые рейсы пойдут по ним');
            onSaved(res.data);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось сохранить условия');
        } finally {
            setSaving(false);
        }
    };

    const incomplete = draft.vatPayer === null
        || (partner?.isCustomer && draft.customerPaymentDays === null)
        || (partner?.isCarrier && draft.carrierPaymentDays === null);

    if (!isDirectoryCard) {
        return (
            <div className={nova.card}>
                <div className={nova.cardHead}>
                    <CircleAlert size={14} />
                    <h2 className={nova.cardTitle}>Условия расчётов</h2>
                </div>
                <div className={nova.cardBody}>
                    <div className={nova.empty}>
                        Это компания, которая сама работает на платформе, а не карточка из вашего
                        справочника. Условия расчётов — ваша договорённость с ней, и держать её в
                        чужой организации нельзя: у неё свои договорённости с другими.
                        <div style={{ marginTop: 6 }}>
                            По рейсам с ней НДС и срок оплаты задаёт бухгалтер в самой заявке —
                            вкладка «Финансы». Пока он этого не сделал, рейс ждёт его: заверить
                            договор печатью и выставить счёт нельзя.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <div className={nova.card}>
                <div className={nova.cardHead}>
                    {incomplete ? <CircleAlert size={14} /> : <BadgeCheck size={14} />}
                    <h2 className={nova.cardTitle}>Налоги</h2>
                    <span className={nova.chip}>{incomplete ? 'заполнено не всё' : 'заполнено'}</span>
                </div>
                <div className={nova.cardBody}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Select
                            style={{ width: 220 }}
                            disabled={!canEdit}
                            value={vatValue}
                            onChange={(v) => setDraft({
                                ...draft,
                                vatPayer: v === 'UNKNOWN' ? null : v === 'YES',
                                vatRate: v === 'YES' ? draft.vatRate ?? 16 : null,
                            })}
                            options={VAT_OPTIONS}
                        />
                        {draft.vatPayer && (
                            <Select
                                style={{ width: 130 }}
                                disabled={!canEdit}
                                value={draft.vatRate ?? 16}
                                onChange={(v) => setDraft({ ...draft, vatRate: v })}
                                options={VAT_RATES.map((r) => ({ value: r.value, label: r.label }))}
                            />
                        )}
                    </div>
                    <div className={nova.itemDesc} style={{ marginTop: 8 }}>
                        Отсюда НДС попадает в договор-заявку, счёт и акт. «Не выяснено» — не то же
                        самое, что «без НДС»: пока ответа нет, платформа не станет печатать его
                        наугад в документе с печатью.
                    </div>
                </div>
            </div>

            {partner?.isCustomer && (
                <div className={nova.card}>
                    <div className={nova.cardHead}>
                        <Receipt size={14} />
                        <h2 className={nova.cardTitle}>Как заказчик — платит нам</h2>
                    </div>
                    <div className={nova.cardBody}>
                        <div style={{ display: 'grid', gap: 10 }}>
                            <label style={{ display: 'grid', gap: 4 }}>
                                <span className={nova.itemLabel}>Когда выставляем ему счёт</span>
                                <Select
                                    style={{ maxWidth: 320 }}
                                    allowClear
                                    disabled={!canEdit}
                                    placeholder="выберите"
                                    value={draft.invoiceTiming}
                                    onChange={(v) => setDraft({ ...draft, invoiceTiming: v ?? null })}
                                    options={INVOICE_TIMINGS}
                                />
                            </label>
                            <label style={{ display: 'grid', gap: 4 }}>
                                <span className={nova.itemLabel}>Отсрочка: сколько дней и от какого дня</span>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <InputNumber
                                        style={{ width: 130 }}
                                        min={0}
                                        max={365}
                                        disabled={!canEdit}
                                        placeholder="дней"
                                        value={draft.customerPaymentDays}
                                        onChange={(v) => setDraft({ ...draft, customerPaymentDays: v })}
                                        addonAfter="дн."
                                    />
                                    <Select
                                        style={{ width: 260 }}
                                        allowClear
                                        disabled={!canEdit}
                                        placeholder="от какого дня считать"
                                        value={draft.customerPaymentFrom}
                                        onChange={(v) => setDraft({ ...draft, customerPaymentFrom: v ?? null })}
                                        options={PAYMENT_ANCHORS.map((a) => ({
                                            value: a.value, label: `${a.label} — ${a.hint}` ,
                                        }))}
                                    />
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {partner?.isCarrier && (
                <div className={nova.card}>
                    <div className={nova.cardHead}>
                        <Truck size={14} />
                        <h2 className={nova.cardTitle}>Как перевозчик — платим ему мы</h2>
                    </div>
                    <div className={nova.cardBody}>
                        <label style={{ display: 'grid', gap: 4 }}>
                            <span className={nova.itemLabel}>Отсрочка: сколько дней и от какого дня</span>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <InputNumber
                                    style={{ width: 130 }}
                                    min={0}
                                    max={365}
                                    disabled={!canEdit}
                                    placeholder="дней"
                                    value={draft.carrierPaymentDays}
                                    onChange={(v) => setDraft({ ...draft, carrierPaymentDays: v })}
                                    addonAfter="дн."
                                />
                                <Select
                                    style={{ width: 260 }}
                                    allowClear
                                    disabled={!canEdit}
                                    placeholder="от какого дня считать"
                                    value={draft.carrierPaymentFrom}
                                    onChange={(v) => setDraft({ ...draft, carrierPaymentFrom: v ?? null })}
                                    options={PAYMENT_ANCHORS.map((a) => ({
                                        value: a.value, label: `${a.label} — ${a.hint}`,
                                    }))}
                                />
                            </div>
                        </label>
                        <div className={nova.itemDesc} style={{ marginTop: 8 }}>
                            Это условие печатается в договоре-заявке. Не заполнено — в договоре про
                            срок оплаты не будет ничего: пустое место в бумаге заметят, а
                            выдуманный срок под печатью — нет.
                        </div>
                    </div>
                </div>
            )}

            {!partner?.isCustomer && !partner?.isCarrier && (
                <div className={nova.empty}>
                    Отметьте в карточке, кто это — заказчик, перевозчик или и то и другое. От этого
                    зависит, какие условия нужны: счёт заказчику выставляем мы, а перевозчик
                    выставляет его нам.
                </div>
            )}

            {canEdit && (
                <div className={nova.heroActions}>
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        onClick={() => !saving && save()}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                        Сохранить условия
                    </button>
                </div>
            )}

            {!canEdit && (
                <div className={nova.itemDesc}>
                    Менять условия расчётов может тот, у кого есть право «Бухгалтерия».
                </div>
            )}
        </div>
    );
}
