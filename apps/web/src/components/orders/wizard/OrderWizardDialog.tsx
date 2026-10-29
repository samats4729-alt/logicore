'use client';

import { useState } from 'react';
import { FocusDialog } from '@/components/nova/FocusDialog';
import { OrderWizard } from './OrderWizard';

/** Что открыть: новую заявку, правку или копию. \`key\` — новое открытие. */
export interface WizardRequest {
    key: number;
    editId?: string;
    fromId?: string;
    quoteRequestId?: string;
}

/**
 * Мастер заявки окном поверх журнала (владелец, 08.10.2026).
 *
 * Закрыл — набранное осталось черновиком в браузере, открыл снова — оно на
 * месте. «Сбросить» стирает черновик и открывает мастер заново.
 *
 * Окно не «запирает» страницу (\`modal={false}\`): внутри мастера поля Ant
 * Design, их списки и календари рисуются поверх страницы, вне окна, — в
 * запертой странице они бы не нажимались.
 */
export function OrderWizardDialog({ request, onClose, onCreated, onSaved, onRefresh }: {
    request: WizardRequest | null;
    onClose: () => void;
    onCreated: () => void;
    onSaved: (orderId: string) => void;
    /** Заявка создана, окно ещё открыто — обновить журнал. */
    onRefresh?: () => void;
}) {
    // Сброс: тот же запрос, но мастер собирается заново — с пустой формой.
    const [restart, setRestart] = useState(0);
    return (
        <FocusDialog
            open={!!request}
            onOpenChange={(open) => { if (!open) onClose(); }}
            modal={false}
            // Размер — из макета окна «Новая заявка» (ТЗ, §3): 1240 × 940.
            width="min(1240px, calc(100vw - 32px))"
            height="min(940px, calc(100svh - 32px))"
            // Esc в раскрытой выпадашке окна (заказчик, адрес, меню шапки)
            // закрывает выпадашку, а не окно с набранной заявкой.
            onEscapeKeyDown={(e) => {
                if (document.querySelector('[data-order-wizard] [role="listbox"], [data-order-wizard] [role="menu"]')) e.preventDefault();
                // Поле, которое само закрывается по Esc (новая почта склада).
                if (e.target instanceof Element && e.target.closest('[data-esc-local]')) e.preventDefault();
            }}
            data-order-wizard-dialog
        >
            {request && (
                <OrderWizard
                    key={`${request.key}-${restart}`}
                    editId={request.editId}
                    fromId={request.fromId}
                    quoteRequestId={request.quoteRequestId}
                    onClose={onClose}
                    onCreated={onCreated}
                    onSaved={onSaved}
                    onRestart={() => setRestart((n) => n + 1)}
                    onRefresh={onRefresh}
                />
            )}
        </FocusDialog>
    );
}
