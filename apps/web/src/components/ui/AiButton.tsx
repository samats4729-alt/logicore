'use client';

import { useState, useCallback } from 'react';

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
            title="ИИ-ассистент"
            onClick={handleClick}
            aria-label="AI-ассистент"
        >
            <span className="ai-btn__ring" />
            <span className="ai-btn__blob" />
            <span className="ai-btn__label">AI</span>
        </button>
    );
}
