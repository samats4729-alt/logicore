'use client';

import type { ReactNode } from 'react';
import { Popconfirm, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import card from './order-card.module.css';

/**
 * Вкладка «Финансы» карточки рейса, «вариант 5» (макет владельца, 31.10.2026):
 * сверху серой плашкой — сальдо со сторонами и маржа, внизу — всё движение
 * денег одним списком. Расчёты не меняются: суммы приходят с сервера, здесь
 * только показ. Сальдо — словами бухгалтера: «Дт» — нам должны заплатить,
 * «Кт» — платим мы (владелец, 25.10.2026: только дебет, кредит, сальдо).
 */

type Fmt = (n: number) => string;

const date = (iso?: string | null) => (iso ? dayjs(iso).format('DD.MM.YYYY') : null);

/** Одна сторона сальдо: сумма, полоса оплаты и подпись под ней. */
function Balance({ label, sign, gross, debt, paid, due, fmt }: {
    label: string;
    sign: 'Дт' | 'Кт';
    gross: number;
    debt: number;
    paid: boolean;
    due?: string | null;
    fmt: Fmt;
}) {
    // Оплачено — то, что закрыло ставку. Сервер считает долг как ставку
    // минус платежи и не уходит ниже нуля, поэтому разница и есть оплата.
    const paidSum = Math.max(0, gross - debt);
    const share = gross > 0 ? Math.min(100, (paidSum / gross) * 100) : 0;
    return (
        <div className={card.figure}>
            <span className={card.figureLabel}>{label}</span>
            <span className={cn(card.figureValue, debt > 0 && card.neg)}>
                {debt > 0 ? `${sign} ${fmt(debt)} ₸` : '0 ₸'}
            </span>
            <div className={card.bar} aria-hidden><b style={{ width: `${share}%` }} /></div>
            <span className={card.figureNote}>
                {paid ? 'оплачено' : 'не оплачено'}
                {gross > 0 && ` · ${fmt(paidSum)} из ${fmt(gross)} ₸`}
                {due && ` · до ${due}`}
            </span>
        </div>
    );
}

/** Показатель без полосы: маржа, поступления, расходы. */
function Figure({ label, value, note, tone }: { label: string; value: string; note?: ReactNode; tone?: 'pos' | 'neg' }) {
    return (
        <div className={card.figure}>
            <span className={card.figureLabel}>{label}</span>
            <span className={cn(card.figureValue, tone === 'pos' && card.pos, tone === 'neg' && card.neg)}>{value}</span>
            {note && <span className={card.figureNote}>{note}</span>}
        </div>
    );
}

/**
 * Главная вещь «Финансов»: с кем какое сальдо и что остаётся нам.
 *
 * Экспедитору — сальдо с заказчиком, с перевозчиком и ожидаемая маржа.
 * Заказчику — сальдо с экспедитором, поступления и расходы: чужую маржу он
 * не видит, как и раньше.
 */
export function OrderFinanceFigures({
    isClient, customerGross, executorGross, summary, customerPaid, executorPaid, customerDue, executorDue, fmt,
}: {
    isClient: boolean;
    customerGross: number;
    executorGross: number;
    summary: any;
    customerPaid: boolean;
    executorPaid: boolean;
    customerDue?: string | null;
    executorDue?: string | null;
    fmt: Fmt;
}) {
    if (isClient) {
        return (
            <section className={card.hero} aria-label="Сальдо по рейсу">
                <div className={card.figures}>
                    <Balance
                        label="Сальдо с экспедитором"
                        sign="Кт"
                        gross={customerGross || 0}
                        debt={summary.customerDebt || 0}
                        paid={customerPaid}
                        due={date(customerDue)}
                        fmt={fmt}
                    />
                    <Figure label="Поступления" value={`${fmt(summary.totalIncomes || 0)} ₸`} />
                    <Figure label="Расходы" value={`${fmt(summary.totalExpenses || 0)} ₸`} />
                </div>
            </section>
        );
    }
    const margin = Number(summary.margin || 0);
    const net = Number(summary.revenueNet || 0);
    return (
        <section className={card.hero} aria-label="Сальдо и маржа по рейсу">
            <div className={card.figures}>
                <Balance
                    label="Сальдо с заказчиком"
                    sign="Дт"
                    gross={customerGross || 0}
                    debt={summary.customerDebt || 0}
                    paid={customerPaid}
                    due={date(customerDue)}
                    fmt={fmt}
                />
                <Balance
                    label="Сальдо с перевозчиком"
                    sign="Кт"
                    gross={executorGross || 0}
                    debt={summary.executorDebt || 0}
                    paid={executorPaid}
                    due={date(executorDue)}
                    fmt={fmt}
                />
                <Figure
                    label="Ожидаемая маржа"
                    value={`${fmt(margin)} ₸`}
                    tone={margin >= 0 ? 'pos' : 'neg'}
                    note={`${net > 0 ? `${(margin / net * 100).toFixed(1).replace('.', ',')}% · ` : ''}без НДС, с прочими поступлениями и расходами`}
                />
            </div>
        </section>
    );
}

const METHOD: Record<string, string> = { CASH: 'Наличные', BANK: 'Банк', CARD: 'Карта', OTHER: 'Прочее' };

type Move = {
    key: string;
    date: string;
    kind: 'payment' | 'income' | 'expense';
    row: any;
};

/**
 * «Движение денег» — платежи, прочие поступления и расходы рейса одним
 * списком по датам. Раньше это были три таблицы, и их принимали за дубль
 * (задачи шефа, A7): чем они отличаются, теперь сказано в меню «Добавить».
 * Обработчики — те же, что у прежних таблиц: правка, удаление, доля общего
 * платежа и платёж «не в ту сторону» работают как раньше.
 */
export function OrderMoneyList({
    payments, incomes, expenses, incomeCategories, expenseCategories,
    customerCompanyId, executorCounterpartyId, canEdit, fmt,
    onAddPayment, onAddIncome, onAddExpense,
    onEditPayment, onDeletePayment, onDeleteIncome, onDeleteExpense, onOpenSharedPayment,
}: {
    payments: any[];
    incomes: any[];
    expenses: any[];
    incomeCategories: { value: string; label: string }[];
    expenseCategories: { value: string; label: string }[];
    customerCompanyId?: string | null;
    executorCounterpartyId?: string;
    canEdit: boolean;
    fmt: Fmt;
    onAddPayment: (direction: 'IN' | 'OUT') => void;
    onAddIncome: () => void;
    onAddExpense: () => void;
    onEditPayment: (row: any) => void;
    onDeletePayment: (id: string) => void;
    onDeleteIncome: (id: string) => void;
    onDeleteExpense: (id: string) => void;
    onOpenSharedPayment: (direction: 'IN' | 'OUT') => void;
}) {
    const moves: Move[] = [
        ...payments.map((row) => ({ key: `p-${row.id}`, date: row.date, kind: 'payment' as const, row })),
        ...incomes.map((row) => ({ key: `i-${row.id}`, date: row.date, kind: 'income' as const, row })),
        ...expenses.map((row) => ({ key: `e-${row.id}`, date: row.date, kind: 'expense' as const, row })),
    ].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());

    const paymentTitle = (r: any) => {
        if (r.direction === 'IN' && customerCompanyId && r.counterpartyId === customerCompanyId) return 'Оплата от заказчика';
        if (r.direction === 'OUT' && executorCounterpartyId && r.counterpartyId === executorCounterpartyId) return 'Оплата перевозчику';
        return r.direction === 'IN' ? 'Поступление' : 'Расход';
    };

    const line = (m: Move) => {
        const r = m.row;
        const off = !!r.isDeleted;
        let title: ReactNode;
        let details: string;
        let sign: '+' | '−';
        let extra: ReactNode = null;
        let acts: ReactNode = null;

        if (m.kind === 'payment') {
            /**
             * Записанные не в ту сторону платежи видно прямо в списке.
             *
             * Новые такими уже не заводятся — сторону проверяет сервер.
             * Но те, что успели записать раньше, лежат молча: строка
             * есть, сумма верная, а оплата не зачтена.
             */
            const wrongSide = r.counterpartyId
                && executorCounterpartyId
                && r.counterpartyId === executorCounterpartyId
                && r.direction === 'IN'
                && !r.refundOfId;
            sign = r.direction === 'IN' ? '+' : '−';
            title = (
                <>
                    {paymentTitle(r)}
                    {wrongSide && (
                        <Tooltip title="Этот контрагент по заявке — перевозчик, платим ему мы. Скорее всего, направление должно быть «Расход» — исправьте карандашом, удалять платёж не нужно.">
                            <span className={cn(card.tag, card.tagNeg)}>не та сторона</span>
                        </Tooltip>
                    )}
                </>
            );
            details = [
                r.counterparty?.name,
                METHOD[r.method] || r.method,
                r.account?.name || (r.method === 'CASH' ? 'Наличные' : 'Расчетный счёт'),
                r.category?.name,
                r.note,
            ].filter(Boolean).join(' · ');
            // Доля общего платежа: по этой заявке пришло столько, а сам
            // перевод больше. Без подписи цифра выглядит как отдельный платёж.
            if (r.isShare) extra = <span className={card.sub}>часть платежа на {fmt(r.paymentTotal)}</span>;
            if (canEdit) {
                // Доля правится и удаляется только вместе со всем платежом:
                // он закрывает и другие рейсы.
                acts = r.isShare ? (
                    <Tooltip title="Это часть общего платежа по нескольким заявкам. Правится он целиком — в разделе «Деньги».">
                        <button type="button" className={card.lnk} onClick={() => onOpenSharedPayment(r.direction)}>
                            Открыть платёж
                        </button>
                    </Tooltip>
                ) : (
                    <>
                        <button type="button" className={card.iconBtn} aria-label="Изменить платёж" title="Изменить" onClick={() => onEditPayment(r)}>
                            <Pencil size={14} />
                        </button>
                        <Popconfirm title="Удалить платёж?" onConfirm={() => onDeletePayment(r.id)} okText="Да" cancelText="Нет">
                            <button type="button" className={cn(card.iconBtn, card.iconBtnDanger)} aria-label="Удалить платёж" title="Удалить">
                                <Trash2 size={14} />
                            </button>
                        </Popconfirm>
                    </>
                );
            }
        } else {
            const income = m.kind === 'income';
            const categories = income ? incomeCategories : expenseCategories;
            sign = income ? '+' : '−';
            title = (
                <>
                    {income ? 'Прочее поступление' : 'Расход рейса'}
                    {off && <span className={card.tag}>удалено</span>}
                </>
            );
            details = [categories.find((x) => x.value === r.category)?.label || r.category, r.description]
                .filter(Boolean).join(' · ');
            if (canEdit && !off) {
                acts = (
                    <Popconfirm
                        title="Удалить?"
                        onConfirm={() => (income ? onDeleteIncome(r.id) : onDeleteExpense(r.id))}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <button
                            type="button"
                            className={cn(card.iconBtn, card.iconBtnDanger)}
                            aria-label={income ? 'Удалить поступление' : 'Удалить расход'}
                            title="Удалить"
                        >
                            <Trash2 size={14} />
                        </button>
                    </Popconfirm>
                );
            }
        }

        return (
            <div key={m.key} className={card.move}>
                <span className={cn(card.muted, card.num, off && card.moveOff)}>{dayjs(m.date).format('DD.MM.YY')}</span>
                <span className={off ? card.moveOff : undefined}>
                    {title}
                    {details && <span className={card.muted}> · {details}</span>}
                </span>
                <span className={card.n}>
                    <b className={off ? card.moveOff : sign === '+' ? card.pos : card.neg}>{sign}{fmt(r.amount)} ₸</b>
                    {extra}
                </span>
                <span className={card.moveActs}>{acts}</span>
            </div>
        );
    };

    const item = (title: string, desc: string, run: () => void) => (
        <DropdownMenuItem onSelect={run} className="flex-col items-start gap-0.5">
            <span className="text-[13px] font-semibold">{title}</span>
            <span className="text-[12px] text-muted-foreground">{desc}</span>
        </DropdownMenuItem>
    );

    return (
        <section className={card.section} aria-label="Движение денег">
            <h2 className={card.head}>
                Движение денег
                {canEdit && (
                    <span className={card.headRight}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button type="button" className={card.lnk}><Plus size={14} /> Добавить</button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-80">
                                {item('Оплата от заказчика', 'Банк или касса. Закрывает долг и счёт заказчика', () => onAddPayment('IN'))}
                                {executorCounterpartyId && item('Оплата перевозчику', 'Банк или касса. Закрывает наш долг перевозчику', () => onAddPayment('OUT'))}
                                {item('Прочее поступление', 'Возврат, компенсация. Прибавляется к марже, долг заказчика не закрывает', onAddIncome)}
                                {item('Расход рейса', 'Топливо, ремонт, штрафы. Уменьшает маржу; оплату перевозчику вносите отдельно', onAddExpense)}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </span>
                )}
            </h2>
            <div className={card.list}>
                {moves.length ? moves.map(line) : (
                    <div className={card.empty}>
                        Денег по рейсу пока не было. Оплаты сторон закрывают долги и счета; прочие поступления и расходы меняют маржу.
                    </div>
                )}
            </div>
        </section>
    );
}
