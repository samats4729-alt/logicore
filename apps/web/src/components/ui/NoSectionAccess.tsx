'use client';

import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Честный отказ вместо пустого экрана.
 *
 * Человек попал сюда по прямой ссылке — из переписки или из закладок. Раньше
 * страница открывалась, запросы получали отказ, и он видел пустые таблицы:
 * решал, что данные потерялись, и шёл выяснять к тому, кто ни при чём.
 *
 * Поэтому говорим три вещи: куда нельзя, почему нельзя и что делать дальше.
 */
export default function NoSectionAccess({
    title,
    roleLabel,
}: {
    title?: string;
    roleLabel?: string;
}) {
    const router = useRouter();

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="w-full max-w-[420px] rounded-2xl bg-card p-6 text-center shadow-soft">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="text-[17px] font-semibold text-foreground">
                    {title ? `Раздел «${title}» вам недоступен` : 'Этот раздел вам недоступен'}
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {roleLabel ? `У вас роль «${roleLabel}».` : ''} Доступ к разделам выдаёт
                    руководитель компании в «Кабинет → Сотрудники». Если раздел нужен для
                    работы — попросите открыть.
                </p>

                <div className="mt-5 flex justify-center gap-2">
                    <Button onClick={() => router.push('/company')}>На главную</Button>
                    <Button variant="outline" onClick={() => router.back()}>Назад</Button>
                </div>
            </div>
        </div>
    );
}
