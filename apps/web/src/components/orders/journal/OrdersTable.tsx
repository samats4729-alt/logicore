'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import styles from './OrdersTable.module.css';

/**
 * Таблица журнала заявок — по макету «LogiCore на shadcn Nova».
 *
 * Своя, а не antd: вид из макета (тонкие линии, шрифт 13, строки ровной
 * высоты) и то, что владелец закрепил в эталоне `design/orders-list`:
 * статус прибит к левому краю, переход в заявку — к правому, середина
 * едет вбок, если не влезает.
 */

export interface JournalColumn<T> {
    key: string;
    /** Заголовок — он же подпись в списке «Колонки». */
    title: string;
    width: number;
    align?: 'left' | 'right';
    /** Прибить к краю: статус слева, действия справа. */
    fixed?: 'left' | 'right';
    /** Не влезло — многоточие; целиком видно в подсказке ячейки. */
    ellipsis?: boolean;
    render: (row: T) => React.ReactNode;
}

export interface JournalPaging {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
}

/**
 * Высота «до низа окна»: таблица прокручивается внутри себя, а подвал со
 * страницами всегда виден — как в макете. Считается от верха элемента на
 * странице, поэтому полосы над ним (подтверждение организации, лента
 * событий) учитываются сами.
 */
export function useFillHeight<T extends HTMLElement>(gap: number, watch?: unknown, min = 320) {
    const ref = useRef<T | null>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const top = el.getBoundingClientRect().top + window.scrollY;
            setHeight(Math.max(min, Math.floor(window.innerHeight - top - gap)));
        };
        measure();
        window.addEventListener('resize', measure);
        // Полоса над страницей появилась или ушла — верх сдвинулся. Сам сдвиг
        // не виден наблюдателю размеров, зато растёт кто-то из предков:
        // следим за всей цепочкой до <body>.
        const ro = new ResizeObserver(measure);
        for (let p: HTMLElement | null = el.parentElement; p && p !== document.body; p = p.parentElement) ro.observe(p);
        return () => {
            window.removeEventListener('resize', measure);
            ro.disconnect();
        };
    // `watch` — сменился вид (таблица, доска, архив): мерить заново новый элемент.
    }, [gap, min, watch]);
    return [ref, height] as const;
}

export function OrdersTable<T extends { id: string }>({
    columns,
    rows,
    loading,
    empty,
    tone,
    selectedId,
    onRowClick,
    onRowDoubleClick,
    paging,
    height,
    scrollRef,
}: {
    columns: JournalColumn<T>[];
    rows: T[];
    loading?: boolean;
    /** Что сказать, когда строк нет: «не загрузилось», «ничего не подошло», «пока нет». */
    empty: React.ReactNode;
    /** Подсветка строки: проблема — красная засечка, отменённая — приглушена. */
    tone?: (row: T) => 'problem' | 'cancelled' | undefined;
    selectedId?: string | null;
    onRowClick?: (row: T) => void;
    onRowDoubleClick?: (row: T) => void;
    paging: JournalPaging;
    height?: number;
    scrollRef?: React.Ref<HTMLDivElement>;
}) {
    const minWidth = columns.reduce((s, c) => s + c.width, 0);
    const fixedClass = (c: JournalColumn<T>) => (c.fixed === 'left' ? styles.fixedLeft : c.fixed === 'right' ? styles.fixedRight : undefined);
    const skeleton = loading && rows.length === 0;

    return (
        <div className={styles.frame}>
            <div ref={scrollRef} className={styles.scroll} style={height ? { maxHeight: height } : undefined} data-orders-table>
                <table className={styles.table} style={{ minWidth }}>
                    <colgroup>
                        {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                    </colgroup>
                    <thead>
                        <tr>
                            {columns.map((c) => (
                                <th key={c.key} className={cn(styles.th, fixedClass(c), c.align === 'right' && styles.right)}>
                                    {c.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {skeleton && Array.from({ length: 8 }, (_, i) => (
                            <tr key={`s${i}`} className={styles.row}>
                                {columns.map((c) => (
                                    <td key={c.key} className={cn(styles.td, fixedClass(c))}>
                                        <span className={styles.bone} style={{ width: `${40 + ((i * 7 + c.width) % 45)}%` }} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {!skeleton && rows.map((row) => {
                            const t = tone?.(row);
                            return (
                                <tr
                                    key={row.id}
                                    data-order-row={row.id}
                                    data-selected={selectedId === row.id || undefined}
                                    className={cn(styles.row, t === 'problem' && styles.problem, t === 'cancelled' && styles.cancelled, onRowClick && styles.clickable)}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                                >
                                    {columns.map((c) => (
                                        <td
                                            key={c.key}
                                            className={cn(styles.td, fixedClass(c), c.align === 'right' && styles.right, c.ellipsis && styles.ellipsis)}
                                        >
                                            {c.render(row)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                        {!skeleton && rows.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className={styles.empty}>{empty}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <JournalPagination paging={paging} />
        </div>
    );
}

/** Номера страниц: первая, последняя и соседи текущей, между ними — «…». */
function pageList(current: number, last: number): (number | '…')[] {
    const set = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
    const sorted = Array.from(set).sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    sorted.forEach((p, i) => {
        if (i && p - sorted[i - 1] > 1) out.push('…');
        out.push(p);
    });
    return out;
}

/** Подвал как в макете: «Показано 1–20 из 37», строк на странице, страницы. */
export function JournalPagination({ paging, sizes = [20, 50, 100] }: { paging: JournalPaging; sizes?: number[] }) {
    const { current, pageSize, total, onChange } = paging;
    const last = Math.max(1, Math.ceil(total / pageSize));
    const from = total ? (current - 1) * pageSize + 1 : 0;
    const to = Math.min(current * pageSize, total);
    return (
        <div className={styles.footer}>
            <span>{total ? <>Показано {from}–{to} из {total}</> : 'Заявок нет'}</span>
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs">Строк на странице</span>
                    <Select value={String(pageSize)} onValueChange={(v) => onChange(1, Number(v))}>
                        <SelectTrigger className="h-8 w-[72px] rounded-lg text-[13px] text-foreground" aria-label="Строк на странице">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {sizes.map((s) => <SelectItem key={s} value={String(s)} className="text-[13px]">{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <nav aria-label="Страницы" className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 rounded-lg px-2 text-[13px] font-normal text-foreground"
                        disabled={current <= 1}
                        onClick={() => onChange(current - 1, pageSize)}
                    >
                        <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Назад</span>
                    </Button>
                    {pageList(current, last).map((p, i) => (p === '…' ? (
                        <span key={`e${i}`} className="grid size-8 place-items-center">…</span>
                    ) : (
                        <Button
                            key={p}
                            variant={p === current ? 'outline' : 'ghost'}
                            size="sm"
                            aria-current={p === current ? 'page' : undefined}
                            className="size-8 rounded-lg p-0 text-[13px] font-normal tabular-nums text-foreground"
                            onClick={() => onChange(p, pageSize)}
                        >
                            {p}
                        </Button>
                    )))}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 rounded-lg px-2 text-[13px] font-normal text-foreground"
                        disabled={current >= last}
                        onClick={() => onChange(current + 1, pageSize)}
                    >
                        <span className="hidden sm:inline">Вперёд</span> <ChevronRight className="size-4" />
                    </Button>
                </nav>
            </div>
        </div>
    );
}
