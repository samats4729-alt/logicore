'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Search } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OpenOrderForPayment } from '@/lib/accounting-documents';
import { cn } from '@/lib/utils';
import styles from './order-payment-picker.module.css';

const money = (value: number) =>
    `${Math.round(value ?? 0).toLocaleString('ru-RU')} ₸`;

const shortDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Просрочка считается по сроку оплаты — она же и главный фильтр. */
const isOverdue = (row: OpenOrderForPayment) =>
    Boolean(row.dueDate) && new Date(row.dueDate as string).getTime() < Date.now();

/**
 * Подбор заявок к платежу — отдельным окном.
 *
 * Заказчик присылает один перевод за два десятка рейсов, и отмечать их
 * приходится помногу. В окне платежа для такого списка места нет: он
 * ужимался до узкой полосы под формой, и бухгалтер искала нужный рейс
 * прокруткой в четыре строки. Правило владельца на такие списки одно —
 * своё окно с поиском и фильтрами, как у адресов.
 *
 * Здесь: поиск по номеру и маршруту, фильтры по просрочке и частичной
 * оплате, отметить всё найденное разом, и внизу — сколько отмечено и на
 * какую сумму. Сумму по каждой заявке можно поправить: платят и частями.
 */
export function OrderPaymentPicker({
    open,
    onOpenChange,
    orders,
    loading,
    error,
    value,
    onApply,
    counterpartyName,
    direction,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orders: OpenOrderForPayment[];
    loading: boolean;
    error: string | null;
    /** Уже отмеченное: заявка → сумма к зачёту. */
    value: Record<string, number>;
    onApply: (picked: Record<string, number>) => void;
    counterpartyName?: string | null;
    direction: 'IN' | 'OUT';
}) {
    const [query, setQuery] = useState('');
    const [only, setOnly] = useState<'all' | 'overdue' | 'partial'>('all');
    /** Черновик выбора: применяется кнопкой, а не по каждому клику. */
    const [picked, setPicked] = useState<Record<string, number>>(value);

    // Окно открыли — показываем то, что уже отмечено в платеже.
    useEffect(() => {
        if (open) {
            setPicked(value);
            setQuery('');
            setOnly('all');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

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

    const pickedIds = Object.keys(picked).filter((id) => (picked[id] || 0) > 0);
    const total = pickedIds.reduce((sum, id) => sum + (picked[id] || 0), 0);

    const toggle = (row: OpenOrderForPayment, checked: boolean) => {
        const next = { ...picked };
        if (checked) next[row.orderId] = row.balance;
        else delete next[row.orderId];
        setPicked(next);
    };

    const setAmount = (orderId: string, raw: string, max: number) => {
        const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
        const parsed = Number(cleaned);
        const next = { ...picked };
        next[orderId] = Number.isFinite(parsed) ? Math.min(parsed, max) : 0;
        setPicked(next);
    };

    /** Отметить всё, что сейчас в списке, — с учётом поиска и фильтров. */
    const pickAllVisible = () => {
        const next = { ...picked };
        for (const row of visible) next[row.orderId] = row.balance;
        setPicked(next);
    };

    const title = direction === 'IN'
        ? 'За какие рейсы пришли деньги'
        : 'За какие рейсы платим';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={styles.panel}>
                <DialogHeader className={styles.head}>
                    <DialogTitle className={styles.title}>{title}</DialogTitle>
                    {counterpartyName && (
                        <div className={styles.subtitle}>{counterpartyName}</div>
                    )}
                </DialogHeader>

                <div className={styles.tools}>
                    <div className={styles.field}>
                        <Search size={15} />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Номер заявки или город"
                            className={styles.input}
                        />
                    </div>
                    <div className={styles.chips}>
                        <FilterChip active={only === 'all'} onClick={() => setOnly('all')}>
                            Все · {orders.length}
                        </FilterChip>
                        {overdueCount > 0 && (
                            <FilterChip active={only === 'overdue'} onClick={() => setOnly('overdue')}>
                                Просроченные · {overdueCount}
                            </FilterChip>
                        )}
                        {partialCount > 0 && (
                            <FilterChip active={only === 'partial'} onClick={() => setOnly('partial')}>
                                Оплачены частично · {partialCount}
                            </FilterChip>
                        )}
                    </div>
                </div>

                <div className={styles.tableHead}>
                    <span className={styles.colPick}>
                        <button
                            type="button"
                            className={styles.linkAction}
                            onClick={pickAllVisible}
                            disabled={visible.length === 0}
                        >
                            Отметить всё
                        </button>
                    </span>
                    <span className={styles.colOrder}>Заявка и маршрут</span>
                    <span className={styles.colDate}>Срок оплаты</span>
                    <span className={styles.colMoney}>Долг</span>
                    <span className={styles.colMoney}>К зачёту</span>
                </div>

                <div className={styles.list}>
                    {loading ? (
                        <div className={styles.state}>
                            {[0, 1, 2, 3, 4].map((row) => (
                                <div key={row} className={styles.skeleton} />
                            ))}
                        </div>
                    ) : error ? (
                        <div className={styles.state}>
                            <AlertTriangle size={18} className={styles.stateIcon} />
                            <div className={styles.stateTitle}>{error}</div>
                            <div className={styles.stateHint}>
                                Закройте окно и откройте снова. Если повторится — напишите в поддержку.
                            </div>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className={styles.state}>
                            <div className={styles.stateTitle}>Долгов по этому контрагенту нет</div>
                            <div className={styles.stateHint}>
                                Здесь появляются рейсы с непогашенным остатком. Сейчас все расчёты закрыты —
                                платёж можно провести и без подбора, он останется авансом.
                            </div>
                        </div>
                    ) : visible.length === 0 ? (
                        <div className={styles.state}>
                            <div className={styles.stateTitle}>Ничего не нашлось</div>
                            <div className={styles.stateHint}>Проверьте поиск и фильтры.</div>
                        </div>
                    ) : (
                        visible.map((row) => {
                            const checked = (picked[row.orderId] || 0) > 0;
                            const overdue = isOverdue(row);
                            return (
                                <label
                                    key={row.orderId}
                                    className={cn(styles.row, checked && styles.rowOn)}
                                    data-order-pick={row.orderNumber}
                                >
                                    <span className={styles.colPick}>
                                        <span className={cn(styles.box, checked && styles.boxOn)}>
                                            {checked && <Check size={13} />}
                                        </span>
                                        <input
                                            type="checkbox"
                                            className={styles.hiddenBox}
                                            checked={checked}
                                            onChange={(e) => toggle(row, e.target.checked)}
                                        />
                                    </span>

                                    <span className={styles.colOrder}>
                                        <span className={styles.orderNumber}>{row.orderNumber}</span>
                                        <span className={styles.orderRoute}>
                                            {row.route || 'маршрут не указан'}
                                            {row.paid > 0 && ` · оплачено ${money(row.paid)} из ${money(row.amount)}`}
                                        </span>
                                    </span>

                                    <span className={cn(styles.colDate, overdue && styles.overdue)}>
                                        {shortDate(row.dueDate)}
                                        {overdue && <span className={styles.overdueMark}>просрочен</span>}
                                    </span>

                                    <span className={styles.colMoney}>{money(row.balance)}</span>

                                    <span className={styles.colMoney}>
                                        {checked ? (
                                            <input
                                                className={styles.amount}
                                                inputMode="decimal"
                                                value={picked[row.orderId] ?? ''}
                                                onClick={(e) => e.preventDefault()}
                                                onChange={(e) => setAmount(row.orderId, e.target.value, row.balance)}
                                            />
                                        ) : (
                                            <span className={styles.dash}>—</span>
                                        )}
                                    </span>
                                </label>
                            );
                        })
                    )}
                </div>

                <div className={styles.foot}>
                    <div className={styles.footTotal}>
                        {pickedIds.length > 0 ? (
                            <>
                                <span className={styles.footCount}>
                                    Отмечено заявок: {pickedIds.length}
                                </span>
                                <span className={styles.footMoney}>{money(total)}</span>
                            </>
                        ) : (
                            <span className={styles.footHint}>
                                Отметьте рейсы — сумма платежа сложится сама
                            </span>
                        )}
                    </div>
                    <div className={styles.footActions}>
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Отмена
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => { onApply(picked); onOpenChange(false); }}
                        >
                            {pickedIds.length > 0 ? `Перенести ${money(total)}` : 'Готово'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function FilterChip({
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
