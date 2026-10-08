'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sparkles, X } from 'lucide-react';

/**
 * Кнопка вызова ИИ-помощника в шапке кабинета.
 *
 * Была цветной анимированной каплей с надписью «AI» — единственным
 * движущимся пятном на всём экране, оно тянуло взгляд сильнее содержимого
 * страницы. Теперь это обычный круглый значок в ряду соседей: звёздочка,
 * никакой анимации.
 *
 * Помощник открывается панелью справа (владелец, 08.10.2026), и кнопка —
 * переключатель: пока панель открыта, она «✕ Помощник» и закрывает её.
 * Что панель открыта, узнаёт от самого помощника — его можно закрыть и
 * крестиком внутри.
 */
export default function AiButton() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onState = (e: Event) => setOpen(!!(e as CustomEvent<{ open: boolean }>).detail?.open);
        window.addEventListener('logicore:assistant-state', onState);
        return () => window.removeEventListener('logicore:assistant-state', onState);
    }, []);

    const handleClick = useCallback(() => {
        // Отметка на случай, если помощник ещё не загрузился: он заберёт её
        // при загрузке и откроется сам (см. AssistantWidget).
        (window as Window & { __lcAssistantPending?: boolean }).__lcAssistantPending = true;
        window.dispatchEvent(new Event('logicore:toggle-assistant'));
    }, []);

    return (
        <button
            type="button"
            className={`ai-btn${open ? ' active ai-btn-open' : ''}`}
            title={open ? 'Закрыть помощника' : 'ИИ-помощник'}
            onClick={handleClick}
            aria-label="ИИ-помощник"
            aria-pressed={open}
        >
            {open ? <><X size={14} /><span>Помощник</span></> : <Sparkles size={15} />}
        </button>
    );
}
