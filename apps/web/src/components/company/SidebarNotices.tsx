'use client';

import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarGroup } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * Важное про кабинет — проверка организации, пробный период — карточкой
 * внизу левого меню, рядом с «Помощью» и «Что нового» (владелец,
 * 08.10.2026). Раньше это были полосы над каждой страницей: они занимали
 * верх любого экрана, а относились не к экрану, а к кабинету.
 *
 * Тон по смыслу: «stop» — что-то закрыто и без шага дальше не работает;
 * «warn» — надо сделать, но работать можно; «info» — просто знать.
 */
export interface CabinetNotice {
    key: string;
    tone: 'info' | 'warn' | 'stop';
    icon: LucideIcon;
    title: string;
    text?: React.ReactNode;
    action?: { label: string; href: string };
}

const TONE: Record<CabinetNotice['tone'], { card: string; icon: string }> = {
    info: {
        card: 'border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground',
        icon: 'text-muted-foreground',
    },
    warn: {
        card: 'border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100',
        icon: 'text-amber-600 dark:text-amber-400',
    },
    stop: {
        card: 'border-red-300/70 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
        icon: 'text-red-600 dark:text-red-400',
    },
};

export function SidebarNotices({ notices, onNavigate }: { notices: CabinetNotice[]; onNavigate?: () => void }) {
    const router = useRouter();
    if (!notices.length) return null;
    return (
        <SidebarGroup className="gap-2 px-0 py-0" aria-label="Важное по кабинету" data-cabinet-notices>
            {notices.map((n) => {
                const Icon = n.icon;
                const tone = TONE[n.tone];
                return (
                    <div key={n.key} data-notice={n.key} className={cn('rounded-lg border border-solid p-3 text-[12px] leading-snug', tone.card)}>
                        <div className="flex items-start gap-2">
                            <Icon className={cn('mt-px size-4 shrink-0', tone.icon)} />
                            <div className="min-w-0">
                                <div className="text-[12.5px] font-semibold">{n.title}</div>
                                {n.text && <div className="mt-0.5 opacity-80">{n.text}</div>}
                            </div>
                        </div>
                        {n.action && (
                            <Button
                                size="sm"
                                className="mt-2.5 h-7 w-full rounded-md text-[12px]"
                                onClick={() => { router.push(n.action!.href); onNavigate?.(); }}
                            >
                                {n.action.label}
                            </Button>
                        )}
                    </div>
                );
            })}
        </SidebarGroup>
    );
}
