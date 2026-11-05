'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { toast } from 'sonner';

/** Шире Google кнопку не рисует. */
const GOOGLE_MAX_WIDTH = 400;

/**
 * Кнопка входа через Google по ширине карточки.
 *
 * Google принимает ширину только числом и сам под экран не подстраивается: с
 * заданной вручную шириной кнопка на телефоне вылезала за края экрана.
 * Поэтому меряем место и рисуем кнопку уже по нему.
 */
export default function GoogleButton({ onSuccess }: { onSuccess: (response: CredentialResponse) => void }) {
    const box = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number | null>(null);

    useEffect(() => {
        if (!box.current) return;
        const observer = new ResizeObserver(([entry]) => {
            setWidth(Math.min(GOOGLE_MAX_WIDTH, Math.floor(entry.contentRect.width)));
        });
        observer.observe(box.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={box} style={{ width: '100%', minHeight: 40, display: 'flex', justifyContent: 'center' }}>
            {width !== null && (
                <GoogleLogin
                    onSuccess={onSuccess}
                    onError={() => toast.error('Ошибка входа через Google')}
                    theme="outline"
                    size="large"
                    width={width}
                />
            )}
        </div>
    );
}
