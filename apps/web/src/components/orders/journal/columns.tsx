'use client';

import dayjs from 'dayjs';
import { ArrowRight, ChevronRight, CircleAlert, Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusPill from '@/components/ui/StatusPill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { needsCompletionReview } from '@/lib/completion-review';
import { shortenCompanyName } from '@/lib/company-helper';
import {
    DEBT_RED,
    ORDER_STATUS_PROGRESS as STATUS_PROGRESS,
    isCustomerSettled,
    isExecutorSettled,
    nameInitials,
    progressColor,
} from '@/lib/order-status';
import { cn } from '@/lib/utils';
import type { JournalColumn } from './OrdersTable';
import type { JournalOrder as Order } from './types';

/**
 * Колонки журнала заявок.
 *
 * Набор и порядок — прежние 13 (решение владельца: сокращать их нельзя,
 * 08.10.2026 подтвердил ещё раз), вид — из макета «shadcn Nova». Ключи те
 * же, что были у таблицы antd: по ним в браузере запомнено, какие колонки
 * человек спрятал.
 */

const Dash = () => <span className="text-muted-foreground">—</span>;

/** Подсказка на значке: чем меньше элементов в строке, тем легче читать. */
function Hint({ text, children }: { text: string; children: React.ReactElement }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">{text}</TooltipContent>
        </Tooltip>
    );
}

/**
 * Номера, по которым заказчик находит рейс у себя: накладная и его
 * собственный номер. Пустых подписей нет — у обычного рейса прочерк.
 */
function RefNumber({ value }: { value?: string | null }) {
    const text = value?.trim();
    if (!text) return <Dash />;
    return <span title={text} className="text-[12px] tabular-nums text-muted-foreground">{text}</span>;
}

/** Контрагент: красным и жирным, если по рейсу не рассчитались. */
function Party({ name, debt, ours, debtText }: { name: string; debt: boolean; ours: boolean; debtText: string }) {
    return (
        <span
            title={debt ? `${name} — ${debtText}` : name}
            className={cn(debt ? 'font-semibold' : ours && 'font-medium')}
            style={debt ? { color: DEBT_RED } : undefined}
        >
            {shortenCompanyName(name)}
        </span>
    );
}

function IconAction({ label, onClick, children, action }: { label: string; onClick: () => void; children: React.ReactNode; action: string }) {
    return (
        <Hint text={label}>
            <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                data-action={action}
                className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onClick(); }}
            >
                {children}
            </Button>
        </Hint>
    );
}

export interface ColumnContext {
    userCompanyId?: string;
    myCompanies: { id: string; name: string }[];
    /** Как этот заказчик называет свой номер перевозки — заголовок колонки. */
    customerRefTitle: string;
    extractCity: (order: Order, type: 'pickup' | 'delivery') => string;
    onPreview: (order: Order) => void;
    onEdit: (order: Order) => void;
    onOpen: (order: Order) => void;
    onInvoice: (invoiceId: string) => void;
}

export function buildColumns(ctx: ColumnContext): { active: JournalColumn<Order>[]; archive: JournalColumn<Order>[] } {
    const { userCompanyId, myCompanies, customerRefTitle, extractCity } = ctx;

    const org: JournalColumn<Order>[] = myCompanies.length > 1 ? [{
        key: 'ourOrg', title: 'Организация', width: 130, ellipsis: true,
        render: (r) => {
            const matched = myCompanies.find((c) => c.id === r.customerCompanyId || c.id === r.forwarderId || c.id === (r as any).subForwarderId);
            const name = matched?.name || '—';
            return <span title={name} className="text-[12px] font-medium text-sky-600 dark:text-sky-400">{shortenCompanyName(name)}</span>;
        },
    }] : [];

    const status = (withMarks: boolean): JournalColumn<Order> => ({
        key: 'status', title: 'Статус', width: 132, fixed: 'left',
        render: (r) => (
            <span className="inline-flex items-center gap-1.5">
                <StatusPill status={r.status} />
                {withMarks && r.pendingStatus === 'COMPLETED' && r.pendingStatusById !== userCompanyId && (
                    <Hint text="Ожидает вашего подтверждения завершения">
                        <CircleAlert className="size-4 shrink-0 text-amber-500" aria-label="Ожидает вашего подтверждения завершения" />
                    </Hint>
                )}
                {withMarks && r.pendingStatus === 'COMPLETED' && r.pendingStatusById === userCompanyId && (
                    <Hint text="Вы запросили завершение, ожидаем подтверждения">
                        <CircleAlert className="size-4 shrink-0 text-sky-500" aria-label="Вы запросили завершение, ожидаем подтверждения" />
                    </Hint>
                )}
                {/* Рейс закрыл водитель, накладную никто не смотрел. Значком,
                    а не подписью: в ячейку статуса вторая строка не влезает.
                    Громкий сигнал — полоса над списком. */}
                {withMarks && needsCompletionReview(r) && (
                    <Hint text="Водитель закрыл рейс — проверьте фото накладной, пока он не уехал">
                        <span data-review-mark className="grid size-4 shrink-0 place-items-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white">!</span>
                    </Hint>
                )}
            </span>
        ),
    });

    const number: JournalColumn<Order> = {
        key: 'orderNumber', title: '№', width: 96, ellipsis: true,
        render: (r) => <span title={r.orderNumber} className="font-medium tabular-nums">{r.orderNumber}</span>,
    };
    const ttn: JournalColumn<Order> = { key: 'ttnNumber', title: 'ТТН', width: 76, ellipsis: true, render: (r) => <RefNumber value={(r as any).ttnNumber} /> };
    const ref: JournalColumn<Order> = { key: 'customerRefNumber', title: customerRefTitle, width: 76, ellipsis: true, render: (r) => <RefNumber value={(r as any).customerRefNumber} /> };
    const created: JournalColumn<Order> = {
        key: 'date', title: 'Дата', width: 58,
        render: (r) => <span className="tabular-nums text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
    };
    const pickup: JournalColumn<Order> = {
        key: 'pickupDate', title: 'Дата погр.', width: 88,
        render: (r) => {
            const date = (r.routePoints?.find((p) => p.pointType === 'PICKUP') as any)?.expectedDate;
            return date ? <span className="tabular-nums">{dayjs(date).format('DD.MM.YY')}</span> : <Dash />;
        },
    };
    const customer: JournalColumn<Order> = {
        key: 'customer', title: 'Заказчик', width: 122, ellipsis: true,
        render: (r) => (
            <Party
                name={r.customerCompany?.name || '—'}
                debt={!isCustomerSettled(r)}
                ours={r.customerCompanyId === userCompanyId}
                debtText="не оплатил"
            />
        ),
    };
    const carrier: JournalColumn<Order> = {
        key: 'forwarder', title: 'Перевозчик', width: 122, ellipsis: true,
        render: (r) => (
            <Party
                name={(r.forwarderId === userCompanyId && r.subForwarder) ? r.subForwarder.name : (r.forwarder?.name || r.subForwarder?.name || r.partner?.name || '—')}
                debt={!isExecutorSettled(r)}
                ours={r.forwarderId === userCompanyId}
                debtText="не оплачено"
            />
        ),
    };
    const driverName = (r: Order) => r.assignedDriverName || (r.driver ? `${r.driver.lastName} ${r.driver.firstName.substring(0, 1)}.` : '');
    const driver: JournalColumn<Order> = {
        key: 'drv', title: 'Водитель', width: 124, ellipsis: true,
        render: (r) => {
            const name = driverName(r);
            if (!name) return <Dash />;
            return (
                <span className="inline-flex max-w-full items-center gap-2" title={name}>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium">{nameInitials(name)}</span>
                    <span className="truncate">{name}</span>
                </span>
            );
        },
    };
    const vehicle: JournalColumn<Order> = {
        key: 'vehicle', title: 'Транспорт', width: 92, ellipsis: true,
        render: (r) => {
            const plate = r.assignedDriverPlate || r.driver?.vehiclePlate;
            return plate ? <span className="tabular-nums">{plate}</span> : <Dash />;
        },
    };
    const route = (withBar: boolean): JournalColumn<Order> => ({
        key: 'route', title: 'Маршрут', width: 146,
        render: (r) => {
            const from = extractCity(r, 'pickup');
            const to = extractCity(r, 'delivery');
            if (!from && !to) return <Dash />;
            return (
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate font-medium" title={`${from || '?'} → ${to || '?'}`}>
                        <span className="truncate">{from || '?'}</span>
                        <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{to || '?'}</span>
                    </div>
                    {/* Полоска пройденного пути цветом статуса — из эталона журнала. */}
                    {withBar && (
                        <div className="mt-1 h-1 w-full max-w-36 overflow-hidden rounded-full bg-muted">
                            <i className="block h-full rounded-full" style={{ width: `${STATUS_PROGRESS[r.status] ?? 0}%`, background: progressColor(r.status) }} />
                        </div>
                    )}
                </div>
            );
        },
    });
    const manager: JournalColumn<Order> = {
        key: 'manager', title: 'Менеджер', width: 92, ellipsis: true,
        render: (r) => (r.responsibleManager
            ? <span>{r.responsibleManager.lastName} {r.responsibleManager.firstName?.substring(0, 1)}.</span>
            : <Dash />),
    };
    const customerPrice: JournalColumn<Order> = {
        key: 'customerPrice', title: 'Ставка зак.', width: 96, align: 'right',
        render: (r) => (r.customerPrice ? <span className="font-medium tabular-nums">{r.customerPrice.toLocaleString('ru-RU')}</span> : <Dash />),
    };
    const carrierPrice: JournalColumn<Order> = {
        key: 'carrierPrice', title: 'Ставка перев.', width: 108, align: 'right',
        render: (r) => {
            const cost = r.driverCost || (r as any).subForwarderPrice;
            return cost ? <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{cost.toLocaleString('ru-RU')}</span> : <Dash />;
        },
    };
    // Выставлен ли счёт. Раньше понять это можно было, только сверяя список
    // заявок с журналом счетов вручную — и рейсы забывались.
    const invoice: JournalColumn<Order> = {
        key: 'invoice', title: 'Счёт', width: 92,
        render: (r) => {
            const doc = r.accountingDocuments?.[0]?.document;
            if (!doc) return <span className="text-[12px] text-muted-foreground">не выставлен</span>;
            return (
                <button
                    type="button"
                    title={`Счёт № ${doc.number}`}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-sky-600 [font-family:inherit] hover:underline dark:text-sky-400"
                    onClick={(e) => { e.stopPropagation(); ctx.onInvoice(doc.id); }}
                >
                    № {doc.number}
                </button>
            );
        },
    };
    /* Глаз — посмотреть рейс в окне с картой, не уходя из списка (владелец,
       08.10.2026). Карандаш — правка прямо из строки: бухгалтер не нашла её
       в боковой панели и решила, что править нечем. Шеврон — в заявку; он
       последний в строке, на это опираются проверки. */
    const actions = (withEdit: boolean): JournalColumn<Order> => ({
        key: 'actions', title: '', width: withEdit ? 96 : 72, fixed: 'right',
        render: (r) => (
            <div className="flex items-center justify-end gap-0.5">
                <IconAction label="Посмотреть рейс" action="preview" onClick={() => ctx.onPreview(r)}><Eye className="size-4" /></IconAction>
                {withEdit && <IconAction label="Изменить заявку и суммы" action="edit" onClick={() => ctx.onEdit(r)}><Pencil className="size-4" /></IconAction>}
                <IconAction label="Открыть заявку" action="open" onClick={() => ctx.onOpen(r)}><ChevronRight className="size-4" /></IconAction>
            </div>
        ),
    });

    return {
        active: [status(true), number, ...org, ttn, ref, created, pickup, customer, carrier, driver, vehicle, route(true), manager, customerPrice, carrierPrice, invoice, actions(true)],
        archive: [status(false), number, ...org, ttn, ref, created, pickup, customer, carrier, driver, vehicle, route(false), manager, customerPrice, carrierPrice, actions(false)],
    };
}
