'use client';

import { useState, useCallback } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Кнопка вызова ИИ-помощника в шапке кабинета.
 *
 * Была цветной анимированной каплей с надписью «AI» — единственным
 * движущимся пятном на всём экране, оно тянуло взгляд сильнее содержимого
 * страницы. Теперь это обычный круглый значок в ряду соседей: звёздочка,
 * никакой анимации, никакой подписи.
 */
export default function AiButton() {
    const [active, setActive] = useState(false);

    const handleClick = useCallback(() => {
        setActive((v) => !v);
        window.dispatchEvent(new Event('logicore:open-assistant'));
    }, []);

    return (
        <button
            type="button"
            className={`ai-btn${active ? ' active' : ''}`}
            title="ИИ-помощник"
            onClick={handleClick}
            aria-label="ИИ-помощник"
        >
            <Sparkles size={15} />
        </button>
    );
}
