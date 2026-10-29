'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import s from './new-order.module.css';

export type SummaryStatus = 'done' | 'warn' | 'error' | 'empty';

export interface SummaryItem {
    key: string;
    title: string;
    status: SummaryStatus;
    /** Первая строка у «!» — чего не хватает; у ✓ — что выбрано. */
    lines: { text: string; tone?: 'muted' | 'warn' | 'error' }[];
    /** Необязательный раздел — в счётчик готовности не входит. */
    optional?: boolean;
}

const поле = (n: number) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'поле';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'поля';
    return 'полей';
};

/**
 * Сводка справа (ТЗ, §6): оглавление и проверка разом. Клик — прокрутка к
 * разделу; раздел, который сейчас на экране, подсвечен. Внизу — кнопка
 * «Создать», всегда активная: ошибки показываются после первой попытки.
 */
export function Summary({ items, current, onGo, errorsCount, submitted, ctaText, onSubmit, busy, ctaNote }: {
    items: SummaryItem[];
    current: string | null;
    onGo: (key: string) => void;
    errorsCount: number;
    submitted: boolean;
    ctaText: string;
    onSubmit: () => void;
    busy: boolean;
    ctaNote?: string;
}) {
    const required = items.filter((i) => !i.optional);
    const ready = required.filter((i) => i.status === 'done').length;
    const counter = submitted && errorsCount > 0
        ? { text: `Исправьте ${errorsCount} ${поле(errorsCount)}`, cls: s.counterErr }
        : ready === required.length
            ? { text: 'Всё готово', cls: s.counterOk }
            : { text: `${ready} из ${required.length} готово`, cls: '' };

    return (
        <aside className={s.aside} aria-labelledby="no-h-summary">
            <div className={s.asideHead}>
                <h2 id="no-h-summary" className={s.sectionTitle}>Сводка</h2>
                <span className={cn(s.counter, counter.cls)}>{counter.text}</span>
            </div>
            <nav className={s.nav} aria-label="Разделы заявки">
                {items.map((it) => (
                    <button
                        key={it.key}
                        type="button"
                        className={cn(s.navItem, current === it.key && s.navItemOn)}
                        aria-current={current === it.key ? 'true' : undefined}
                        onClick={() => onGo(it.key)}
                    >
                        <StatusMark status={it.status} />
                        <span className={s.navLines}>
                            <span className={s.navTitle}>{it.title}</span>
                            {it.lines.map((ln, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        s.navLine,
                                        // Не начатый раздел — подсказка спокойная, серая (ТЗ, §6).
                                        (ln.tone === 'muted' || it.status === 'empty') && s.navLineMuted,
                                        it.status !== 'empty' && ln.tone === 'warn' && s.navLineWarn,
                                        it.status !== 'empty' && ln.tone === 'error' && s.navLineErr,
                                    )}
                                    title={ln.text}
                                >
                                    {ln.text}
                                </span>
                            ))}
                        </span>
                    </button>
                ))}
            </nav>
            <div className={s.asideFoot}>
                <SubmitBlock
                    errorsCount={errorsCount}
                    submitted={submitted}
                    ctaText={ctaText}
                    onSubmit={onSubmit}
                    busy={busy}
                    ctaNote={ctaNote}
                />
            </div>
        </aside>
    );
}

export function SubmitBlock({ errorsCount, submitted, ctaText, onSubmit, busy, ctaNote, compact }: {
    errorsCount: number;
    submitted: boolean;
    ctaText: string;
    onSubmit: () => void;
    busy: boolean;
    ctaNote?: string;
    compact?: boolean;
}) {
    return (
        <>
            {submitted && errorsCount > 0 && !compact && (
                <p role="alert" className={s.alert}>
                    <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
                    <span>
                        {errorsCount === 1
                            ? 'Не хватает одного поля — оно отмечено красным.'
                            : `Не хватает ${errorsCount} ${поле(errorsCount)} — они отмечены красным.`}
                    </span>
                </p>
            )}
            <button type="button" className={s.cta} onClick={onSubmit} disabled={busy} data-guide={compact ? undefined : 'wizard-submit'}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {ctaText}
                {!compact && <span className={s.kbd}>Ctrl ↵</span>}
            </button>
            {ctaNote && !compact && <span className={s.ctaNote}>{ctaNote}</span>}
        </>
    );
}

function StatusMark({ status }: { status: SummaryStatus }) {
    if (status === 'done') return <span className={s.stDone} aria-label="готово"><Check className="size-3" strokeWidth={3} /></span>;
    if (status === 'warn') return <span className={s.stWarn} aria-label="не хватает данных">!</span>;
    if (status === 'error') return <span className={s.stErr} aria-label="ошибка">!</span>;
    return <span className={s.stEmpty} aria-label="не начат" />;
}
