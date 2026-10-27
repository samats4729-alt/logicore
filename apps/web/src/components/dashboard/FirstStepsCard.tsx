'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import styles from './board/board.module.css';

interface FirstSteps {
    organizationSent: boolean;
    counterparties: number;
    orders: number;
    employees: number;
}

/** Скрыл руководитель — на этой компании больше не показываем. */
const HIDDEN_KEY = (companyId: string) => `lc-first-steps-hidden:${companyId}`;

/**
 * Первые шаги новой компании — над блоками дашборда (J5, владелец: «дашборд
 * не пустой при первом входе»).
 *
 * У новой компании все блоки — нули и «нет данных», и первое впечатление —
 * пустой кабинет. Здесь четыре шага, после которых в блоках появятся
 * данные; сделанное отмечается само. Когда сделано всё — блока нет; убрать
 * раньше можно крестиком.
 */
export default function FirstStepsCard({ companyId }: { companyId?: string | null }) {
    const [steps, setSteps] = useState<FirstSteps | null>(null);
    const [hidden, setHidden] = useState(true);

    useEffect(() => {
        if (!companyId) return;
        try { setHidden(localStorage.getItem(HIDDEN_KEY(companyId)) === '1'); } catch { setHidden(false); }
        api.get('/company/dashboard/first-steps').then((r) => setSteps(r.data)).catch(() => setSteps(null));
    }, [companyId]);

    if (!companyId || !steps || hidden) return null;

    const items = [
        { done: steps.organizationSent, title: 'Заполните организацию', text: 'Реквизиты и документы — после проверки вас видят контрагенты', href: '/company/onboarding', action: 'Заполнить' },
        { done: steps.counterparties > 0, title: 'Добавьте заказчика', text: 'Карточка с БИН и условиями оплаты — их подставит заявка', href: '/company/partners', action: 'Добавить' },
        { done: steps.orders > 0, title: 'Создайте первую заявку', text: 'Маршрут, груз, цена — дальше назначите водителя или перевозчика', href: '/company/orders/create', action: 'Создать' },
        { done: steps.employees > 1, title: 'Пригласите сотрудников', text: 'Логисты и бухгалтер — каждому свои разделы', href: '/company/users', action: 'Пригласить' },
    ];
    const done = items.filter((i) => i.done).length;
    // Сделано всё — или компания давно в работе: подсказка «с чего начать»
    // ей уже ни к чему, даже если какой-то шаг пропущен.
    if (done === items.length || steps.orders >= 5) return null;

    const hide = () => {
        try { localStorage.setItem(HIDDEN_KEY(companyId), '1'); } catch { /* приватное окно — не запомнится */ }
        setHidden(true);
    };

    return (
        <section aria-label="Первые шаги" className={cn(styles.card, 'mt-3 p-4')}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[15px] font-semibold">С чего начать</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                        Сделано {done} из {items.length} — после этих шагов блоки ниже заполнятся
                    </div>
                </div>
                <button
                    type="button"
                    onClick={hide}
                    aria-label="Убрать блок «С чего начать»"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                    <X className="size-4" />
                </button>
            </div>
            <ol className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((item, i) => (
                    <li key={item.title} className="flex min-w-0 flex-col gap-2 rounded-xl border border-solid border-border p-3">
                        <div className="flex items-center gap-2">
                            <span
                                className={cn(
                                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                                    item.done ? 'bg-foreground text-background' : 'border border-solid border-border text-muted-foreground',
                                )}
                            >
                                {item.done ? <Check className="size-3" /> : i + 1}
                            </span>
                            <span className={cn('truncate text-[13px] font-medium', item.done && 'text-muted-foreground line-through')}>{item.title}</span>
                        </div>
                        <div className="text-[12px] leading-snug text-muted-foreground">{item.text}</div>
                        {!item.done && (
                            <Link href={item.href} className="mt-auto inline-flex items-center gap-1 text-[12px] font-medium text-foreground no-underline hover:underline">
                                {item.action} <ArrowRight className="size-3.5" />
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}
