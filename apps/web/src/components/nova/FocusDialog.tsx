'use client';

import { useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import styles from './FocusDialog.module.css';

/**
 * Большое окно посередине экрана, фон за ним размыт (владелец, 08.10.2026).
 *
 * Одна оболочка на все такие окна: «Открыть крупно» на дашборде,
 * просмотр заявки по значку глаза в журнале, мастер заявки. Внутри — что
 * угодно; шапку и кнопку закрытия рисует тот, кто окно открывает.
 *
 * Фокус при открытии — на само окно, а не на первую кнопку: иначе кнопка
 * при открытии мышкой встречает жирной рамкой выделения. Esc закрывает.
 *
 * \`modal={false}\` — для окон с полями Ant Design внутри (мастер заявки).
 * Обычное окно «запирает» страницу, а выпадающие списки и календари antd
 * рисуются поверх неё, вне окна, — и в запертой странице не нажимались бы.
 * Такое окно не запирает страницу, но выглядит так же: размытый фон, щелчок
 * мимо окно не закрывает (там набранная форма), прокрутка под ним стоит.
 */
export function FocusDialog({ open, onOpenChange, width, height, className, children, modal = true, onEscapeKeyDown, ...rest }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Ширина и высота — CSS-выражения, например `min(1240px, calc(100vw - 32px))`. */
    width: string;
    height?: string;
    className?: string;
    children: React.ReactNode;
    modal?: boolean;
} & Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'children' | 'className'>) {
    const content = useRef<HTMLDivElement>(null);

    // Незапирающее окно: страница под ним не прокручивается.
    useEffect(() => {
        if (modal || !open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [modal, open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
            <DialogPortal>
                {modal
                    ? <DialogOverlay className={cn('bg-black/25', styles.overlay)} />
                    : open && <div aria-hidden className={cn('fixed inset-0 z-50 bg-black/25', styles.overlay)} />}
                <DialogPrimitive.Content
                    ref={content}
                    tabIndex={-1}
                    className={cn(styles.dialog, 'fixed left-1/2 top-1/2 z-50 flex flex-col overflow-hidden rounded-2xl bg-card text-card-foreground outline-none', className)}
                    style={{ width, height, maxHeight: 'calc(100svh - 32px)' }}
                    onOpenAutoFocus={(e) => { e.preventDefault(); content.current?.focus(); }}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    // Щелчок мимо незапирающего окна — это щелчок по выпадающему
                    // списку antd или по чему-то за окном: закрывать не за что.
                    onInteractOutside={modal ? undefined : (e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => {
                        // Esc закрывает сначала открытый список или календарь antd,
                        // а не всё окно вместе с набранным.
                        if (!modal && document.querySelector(
                            '.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-modal-wrap:not([style*="display: none"])',
                        )) e.preventDefault();
                        onEscapeKeyDown?.(e);
                    }}
                    {...rest}
                >
                    {children}
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
