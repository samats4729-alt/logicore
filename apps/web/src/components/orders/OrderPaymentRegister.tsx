'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { OpenOrderForPayment } from '@/lib/accounting-documents';
import { cn } from '@/lib/utils';
import styles from './order-payment-register.module.css';

const money = (value: number) =>
    `${Math.round(value ?? 0).toLocaleString('ru-RU')} ₸`;

/** Сумма в поле ввода — с разрядами, как в соседних колонках. */
const editable = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(value)) return '';
    return Math.round(value).toLocaleString('ru-RU');
};

const shortDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const isOverdue = (row: OpenOrderForPayment) =>
    Boolean(row.dueDate) && new Date(row.dueDate as string).getTime() < Date.now();

/**
 * Реестр неоплаченных заявок внутри документа платежа.
 *
 * Это таблица подбора, а не отдельное окно. Второе окно поверх первого
 * выглядело несерьёзно и мешало: половина формы платежа торчала из-под
 * него, и было непонятно, что с чем связано. В бухгалтерской программе,
 * от которой люди приходят, это один документ — реквизиты сверху, строки
 * подбора в теле, итог внизу. Здесь так же.
 *
 * Отметки живут у родителя: сумма платежа складывается из них сразу, без
 * промежуточного «применить».
 */
export function OrderPaymentRegister({
    orders,
    loading,
    error,
    value,
    onChange,
    direction,
}: {
    orders: OpenOrderForPayment[];
    loading: boolean;
    error: string | null;
    /** Отмеченное: заявка → сумма к зачёту. */
    value: Record<string, number>;
    onChange: (next: Record<string, number>) => void;
    direction: 'IN' | 'OUT';
}) {
    const [query, setQuery] = useState('');
    const [only, setOnly] = useState<'all' | 'overdue' | 'partial'>('all');

    const overdueCount = useMemo(() => orders.filter(isOverdue).length, [orders]);
    const partialCount = useMemo(() => orders.filter((row) => row.paid > 0).length, [orders]);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return orders.filter((row) => {
            if (only === 'overdue' && !isOverdue(row)) return false;
            if (only === 'partial' && row.paid <= 0) return false;
            if (!needle) return true;
            return `${row.orderNumber} ${row.route ?? ''}`.toLowerCase().includes(needle);
        });
    }, [orders, query, only]);

    const pickedIds = Object.keys(value).filter((id) => (value[id] || 0) > 0);
    const pickedTotal = pickedIds.reduce((sum, id) => sum + (value[id] || 0), 0);
    const visibleDebt = visible.reduce((sum, row) => sum + row.balance, 0);
    const allVisiblePicked = visible.length > 0
        && visible.every((row) => (value[row.orderId] || 0) > 0);

    const toggle = (row: OpenOrderForPayment, checked: boolean) => {
        const next = { ...value };
        if (checked) next[row.orderId] = row.balance;
        else delete next[row.orderId];
        onChange(next);
    };

    /** Отметить или снять всё, что сейчас в списке, — с учётом поиска. */
    const toggleAllVisible = (checked: boolean) => {
        const next = { ...value };
        for (const row of visible) {
            if (checked) next[row.orderId] = row.balance;
            else delete next[row.orderId];
        }
        onChange(next);
    };

    const setAmount = (row: OpenOrderForPayment, raw: string) => {
        const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
        const parsed = Number(cleaned);
        const next = { ...value };
        next[row.orderId] = Number.isFinite(parsed) ? Math.min(parsed, row.balance) : 0;
        onChange(next);
    };

    return (
        <section className={styles.block}>
            <header className={styles.head}>
                <div>
                    <div className={styles.eyebrow}>Подбор по заявкам</div>
                    <div className={styles.headHint}>
                        {direction === 'IN'
                            ? 'Отметьте рейсы, за которые пришли деньги — сумма платежа сложится сама'
                            : 'Отметьте рейсы, за которые платим — сумма платежа сложится сама'}
                    </div>
                </div>
                <div className={styles.tools}>
                    <div className={styles.field}>
                        <Search size={14} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Номер или город"
                            className={styles.input}
                        />
                    </div>
                    <div className={styles.chips}>
                        <Chip active={only === 'all'} onClick={() => setOnly('all')}>
                            Все {orders.length}
                        </Chip>
                        {overdueCount > 0 && (
                            <Chip active={only === 'overdue'} onClick={() => setOnly('overdue')}>
                                Просроченные {overdueCount}
                            </Chip>
                        )}
                        {partialCount > 0 && (
                            <Chip active={only === 'partial'} onClick={() => setOnly('partial')}>
                                Частично {partialCount}
                            </Chip>
                        )}
                    </div>
                </div>
            </header>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.thPick}>
                                <label className={styles.pickCell}>
                                    <input
                                        type="checkbox"
                                        className={styles.box}
                                        checked={allVisiblePicked}
                                        disabled={visible.length === 0}
                                        onChange={(e) => toggleAllVisible(e.target.checked)}
                                        aria-label="Отметить все заявки в списке"
                                    />
                                </label>
                            </th>
                            <th>Заявка</th>
                            <th>Маршрут</th>
                            <th className={styles.thDate}>Срок оплаты</th>
                            <th className={styles.thMoney}>Сумма рейса</th>
                            <th className={styles.thMoney}>Оплачено</th>
                            <th className={styles.thMoney}>Долг</th>
                            <th className={styles.thMoney}>К зачёту</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loading ? (
                            [0, 1, 2, 3].map((row) => (
                                <tr key={row} className={styles.skeletonRow}>
                                    <td colSpan={8}><span className={styles.skeleton} /></td>
                                </tr>
                            ))
                        ) : error ? (
                            <tr>
                                <td colSpan={8} className={styles.state}>
                                    <AlertTriangle size={18} className={styles.stateIcon} />
                                    <div className={styles.stateTitle}>{error}</div>
                                    <div className={styles.stateHint}>
                                        Закройте окно и откройте снова. Если повторится — напишите в поддержку.
                                    </div>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={8} className={styles.state}>
                                    <div className={styles.stateTitle}>Долгов по этому контрагенту нет</div>
                                    <div className={styles.stateHint}>
                                        Здесь появляются рейсы с непогашенным остатком. Платёж можно провести
                                        и без подбора — он останется авансом.
                                    </div>
                                </td>
                            </tr>
                        ) : visible.length === 0 ? (
                            <tr>
                                <td colSpan={8} className={styles.state}>
                                    <div className={styles.stateTitle}>Ничего не нашлось</div>
                                    <div className={styles.stateHint}>Проверьте поиск и фильтры.</div>
                                </td>
                            </tr>
                        ) : (
                            visible.map((row) => {
                                const checked = (value[row.orderId] || 0) > 0;
                                const overdue = isOverdue(row);
                                return (
                                    <tr
                                        key={row.orderId}
                                        className={cn(styles.row, checked && styles.rowOn)}
                                        data-order-pick={row.orderNumber}
                                    >
                                        <td className={styles.thPick}>
                                            <label className={styles.pickCell}>
                                                <input
                                                    type="checkbox"
                                                    className={styles.box}
                                                    checked={checked}
                                                    onChange={(e) => toggle(row, e.target.checked)}
                                                    aria-label={`Отметить заявку ${row.orderNumber}`}
                                                />
                                            </label>
                                        </td>
                                        <td className={styles.cellOrder}>{row.orderNumber}</td>
                                        <td className={styles.cellRoute}>
                                            {row.route || '—'}
                                        </td>
                                        <td className={cn(styles.thDate, overdue && styles.overdue)}>
                                            {shortDate(row.dueDate)}
                                            {overdue && <div className={styles.overdueMark}>просрочен</div>}
                                        </td>
                                        <td className={styles.thMoney}>{money(row.amount)}</td>
                                        <td className={cn(styles.thMoney, styles.muted)}>
                                            {row.paid > 0 ? money(row.paid) : '—'}
                                        </td>
                                        <td className={styles.thMoney}>{money(row.balance)}</td>
                                        <td className={styles.thMoney}>
                                            {checked ? (
                                                <input
                                                    className={styles.amount}
                                                    inputMode="decimal"
                                                    value={editable(value[row.orderId])}
                                                    onChange={(e) => setAmount(row, e.target.value)}
                                                    aria-label={`Сумма к зачёту по заявке ${row.orderNumber}`}
                                                />
                                            ) : (
                                                <span className={styles.muted}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>

                    {visible.length > 0 && (
                        <tfoot>
                            <tr className={styles.total}>
                                <td />
                                <td colSpan={3}>
                                    Итого{only !== 'all' || query ? ' по отбору' : ''}: {visible.length}
                                </td>
                                <td className={styles.thMoney} />
                                <td className={styles.thMoney} />
                                <td className={styles.thMoney}>{money(visibleDebt)}</td>
                                <td className={styles.thMoney}>
                                    {pickedIds.length > 0 ? money(pickedTotal) : '—'}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </section>
    );
}

function Chip({
    active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(styles.chip, active && styles.chipOn)}
        >
            {children}
        </button>
    );
}
