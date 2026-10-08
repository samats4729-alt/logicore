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
export function OrderWizardDialog({ request, onClose, onCreated, onSaved }: {
    request: WizardRequest | null;
    onClose: () => void;
    onCreated: () => void;
    onSaved: (orderId: string) => void;
}) {
    // Сброс: тот же запрос, но мастер собирается заново — с пустой формой.
    const [restart, setRestart] = useState(0);
    return (
        <FocusDialog
            open={!!request}
            onOpenChange={(open) => { if (!open) onClose(); }}
            modal={false}
            width="min(820px, calc(100vw - 32px))"
            height="min(880px, calc(100svh - 32px))"
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
                />
            )}
        </FocusDialog>
    );
}
