'use client';

import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import styles from './FocusDialog.module.css';

/**
 * Большое окно посередине экрана, фон за ним размыт (владелец, 08.10.2026).
 *
 * Одна оболочка на все такие окна: «Открыть крупно» на дашборде,
 * просмотр заявки по значку глаза в журнале. Внутри — что угодно; шапку
 * и кнопку закрытия рисует тот, кто окно открывает.
 *
 * Фокус при открытии — на само окно, а не на первую кнопку: иначе кнопка
 * при открытии мышкой встречает жирной рамкой выделения. Esc и щелчок
 * мимо закрывают окно.
 */
export function FocusDialog({ open, onOpenChange, width, height, className, children, ...rest }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Ширина и высота — CSS-выражения, например `min(1240px, calc(100vw - 32px))`. */
    width: string;
    height?: string;
    className?: string;
    children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'children' | 'className'>) {
    const content = useRef<HTMLDivElement>(null);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogPortal>
                <DialogOverlay className={cn('bg-black/25', styles.overlay)} />
                <DialogPrimitive.Content
                    ref={content}
                    tabIndex={-1}
                    className={cn(styles.dialog, 'fixed left-1/2 top-1/2 z-50 flex flex-col overflow-hidden rounded-2xl bg-card text-card-foreground outline-none', className)}
                    style={{ width, height, maxHeight: 'calc(100svh - 32px)' }}
                    onOpenAutoFocus={(e) => { e.preventDefault(); content.current?.focus(); }}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    {...rest}
                >
                    {children}
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
