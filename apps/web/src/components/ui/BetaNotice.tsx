'use client';

import { useRouter } from 'next/navigation';
import { FlaskConical, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BetaSection } from '@/lib/beta-sections';

/**
 * Полоса над содержимым раздела, который открыт, но ещё не проверен в деле.
 *
 * Стоит над страницей, а не в меню: по прямой ссылке и из закладок человек
 * приходит сюда, минуя меню, и предупреждение в меню он не увидит.
 */
export function BetaStrip({ section }: { section: BetaSection }) {
    return (
        <div className="lc-beta-strip" role="note">
            <FlaskConical size={13} aria-hidden />
            <span className="lc-beta-strip-title">Бета-тестирование</span>
            <span className="lc-beta-strip-text">{section.reason}</span>
        </div>
    );
}

/**
 * Заглушка вместо закрытого раздела.
 *
 * Причина называется прямо: не «нет доступа» — доступ как раз есть, — а
 * «раздел не достроен». Иначе человек пойдёт просить права, которых ему
 * не нужно.
 */
export function BetaClosed({ section }: { section: BetaSection }) {
    const router = useRouter();

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="w-full max-w-[420px] rounded-2xl bg-card p-6 text-center shadow-soft">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="text-[17px] font-semibold text-foreground">
                    Раздел «{section.title}» пока закрыт
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {section.reason} Он вернётся, когда будет доделан и проверен.
                </p>

                <div className="mt-5 flex justify-center gap-2">
                    <Button onClick={() => router.push('/company')}>На главную</Button>
                    <Button variant="outline" onClick={() => router.back()}>Назад</Button>
                </div>
            </div>
        </div>
    );
}
