'use client';

import dayjs from 'dayjs';
import { money, currencySign } from '@/lib/money-format';
import { useKztRates } from '@/lib/currency-rates';
import styles from './MarginSummary.module.css';

interface MarginSummaryProps {
    /** Подписи берём те же, что стоят у полей ставок выше по форме. */
    customerLabel: string;
    customerNet: number;
    carrierLabel: string;
    carrierNet: number;
    margin: number;
    marginPercent: number;
    /** Хотя бы одна сторона с НДС — значит в расчёте суммы без налога. */
    netOfVat: boolean;
    /** В какой валюте суммы расчёта; без неё — тенге. */
    currency?: string;
    /** По какому курсу пересчитано: «1 ₽ = 5,12 ₸ на 08.10». */
    rateNote?: string | null;
}

/**
 * Расчёт по рейсу: что получим, что заплатим и что останется.
 *
 * Показываем всю строку, а не один итог: логист набирает две ставки и
 * должен видеть, что платформа поняла обе так же, как он.
 */
export function MarginSummary({
    customerLabel,
    customerNet,
    carrierLabel,
    carrierNet,
    margin,
    marginPercent,
    netOfVat,
    currency = 'KZT',
    rateNote,
}: MarginSummaryProps) {
    const убыток = margin < 0;

    return (
        <div className={styles.root}>
            <div className={styles.eyebrow}>Расчёт по рейсу</div>
            <div className={styles.row}>
                <div className={styles.cell}>
                    <span className={styles.label}>{customerLabel}</span>
                    <span className={styles.value}>{money(customerNet, currency)}</span>
                </div>
                <span className={styles.op}>−</span>
                <div className={styles.cell}>
                    <span className={styles.label}>{carrierLabel}</span>
                    <span className={styles.value}>{money(carrierNet, currency)}</span>
                </div>
                <span className={styles.op}>=</span>
                <div className={styles.result}>
                    <span className={styles.label}>{убыток ? 'Убыток' : 'Маржа'}</span>
                    <span className={`${styles.resultValue} ${убыток ? styles.resultValueNeg : ''}`}>
                        {money(margin, currency)}
                    </span>
                    <span className={`${styles.percent} ${убыток ? styles.percentNeg : ''}`}>
                        {marginPercent}%
                    </span>
                </div>
            </div>
            {(rateNote || netOfVat) && (
                <div className={styles.note}>
                    {[rateNote, netOfVat && 'Суммы без НДС — налог в марже не считается доходом.'].filter(Boolean).join(' · ')}
                </div>
            )}
        </div>
    );
}

/** Расчёт есть, а посчитать нельзя: нет курса, курс ещё грузится. */
function MarginUnavailable({ children }: { children: React.ReactNode }) {
    return (
        <div className={styles.root} data-margin-unavailable>
            <div className={styles.eyebrow}>Расчёт по рейсу</div>
            <div className={styles.note} style={{ marginTop: 0 }}>{children}</div>
        </div>
    );
}

/**
 * Расчёт по рейсу из двух ставок — с переводом валют.
 *
 * Клиент платит в рублях, перевозчику платим в тенге: «1 000 ₽ − 50 000 ₸»
 * вычитать напрямую нельзя — выходил ложный убыток (владелец, 08.10.2026).
 * Поэтому, как и сервер при сохранении заявки, переводим обе ставки в
 * тенге по курсу на дату погрузки (пока её нет — на сегодня) и только
 * потом вычитаем. Валюта одна — считаем прямо в ней, курс не нужен.
 *
 * Курса нет — так и пишем, а не показываем число: «доллар равен тенге»
 * в марже хуже, чем пустое место.
 */
export function MarginPreview({
    customerPrice,
    driverCost,
    customerCurrency,
    carrierCurrency,
    date,
    customerVatRate,
    carrierVatRate,
    customerLabel,
    carrierLabel,
}: {
    customerPrice: number;
    driverCost: number;
    customerCurrency?: string | null;
    carrierCurrency?: string | null;
    /** Дата погрузки из формы (dayjs, строка или пусто). */
    date?: unknown;
    /** Ставка НДС, если сторона платит НДС; `null` — без НДС. */
    customerVatRate: number | null;
    carrierVatRate: number | null;
    customerLabel: string;
    carrierLabel: string;
}) {
    const cur = (customerCurrency || 'KZT').toUpperCase();
    const dcCur = (carrierCurrency || 'KZT').toUpperCase();
    const нуженКурс = cur !== dcCur;
    const день = (date && dayjs(date as any).isValid() ? dayjs(date as any) : dayjs()).format('YYYY-MM-DD');
    const { rates, loading, failed } = useKztRates(нуженКурс ? день : null);

    let cp = customerPrice;
    let dc = driverCost;
    let currency = cur;
    let rateNote: string | null = null;

    if (нуженКурс) {
        if (failed) return <MarginUnavailable>Не удалось получить курс валют — маржу пока не посчитать.</MarginUnavailable>;
        if (loading || !rates) return <MarginUnavailable>Считаем маржу по курсу…</MarginUnavailable>;
        const курс = (code: string) => (code === 'KZT' ? 1 : rates[code]?.rate ?? null);
        const нет = [cur, dcCur].filter((code) => !курс(code));
        if (нет.length) {
            return (
                <MarginUnavailable>
                    Нет курса {нет.join(', ')} на {dayjs(день).format('DD.MM')} — маржу не посчитать.
                    Курс загружает бухгалтер в разделе «Валюты».
                </MarginUnavailable>
            );
        }
        cp = customerPrice * курс(cur)!;
        dc = driverCost * курс(dcCur)!;
        currency = 'KZT';
        rateNote = 'В тенге по курсу: ' + [cur, dcCur]
            .filter((code) => code !== 'KZT')
            .map((code) => {
                const r = rates[code]!;
                const на = r.rateDate ? ` на ${dayjs(r.rateDate).format('DD.MM')}` : '';
                return `1 ${currencySign(code)} = ${Number(r.rate).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ₸${на}`;
            })
            .join(', ');
    }

    const cpNet = customerVatRate !== null ? cp / (1 + customerVatRate / 100) : cp;
    const dcNet = carrierVatRate !== null ? dc / (1 + carrierVatRate / 100) : dc;
    const margin = Math.round((cpNet - dcNet) * 100) / 100;
    const marginPercent = cpNet > 0 ? Math.round((margin / cpNet) * 100) : 0;

    return (
        <MarginSummary
            customerLabel={customerLabel}
            customerNet={cpNet}
            carrierLabel={carrierLabel}
            carrierNet={dcNet}
            margin={margin}
            marginPercent={marginPercent}
            netOfVat={customerVatRate !== null || carrierVatRate !== null}
            currency={currency}
            rateNote={rateNote}
        />
    );
}
