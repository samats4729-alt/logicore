'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Фото профиля пользователя. Загружается blob'ом (эндпоинт требует токен,
 * обычный <img src> не подходит), кэшируется на время сессии.
 * Если фото нет — рендерится переданный fallback (инициалы).
 */

const urlCache = new Map<string, Promise<string | null>>();

function loadAvatarUrl(userId: string): Promise<string | null> {
    if (!urlCache.has(userId)) {
        urlCache.set(
            userId,
            api.get(`/users/${userId}/avatar`, { responseType: 'blob' })
                .then((res) => URL.createObjectURL(res.data))
                .catch(() => null),
        );
    }
    return urlCache.get(userId)!;
}

/** Сбросить кэш и оповестить все смонтированные аватары (после загрузки нового фото) */
export function notifyAvatarUpdated(userId: string) {
    urlCache.delete(userId);
    window.dispatchEvent(new CustomEvent('lc:avatar-updated', { detail: userId }));
}

interface UserAvatarProps {
    userId: string;
    /** Есть ли фото (avatarPath из API) — без него запрос не делается */
    hasAvatar?: boolean;
    size?: number;
    fallback: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export default function UserAvatar({ userId, hasAvatar = true, size = 40, fallback, className, style }: UserAvatarProps) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        if (userId && hasAvatar) {
            loadAvatarUrl(userId).then((u) => { if (alive) setUrl(u); });
        } else {
            setUrl(null);
        }

        const onUpdated = (e: Event) => {
            if ((e as CustomEvent).detail === userId) {
                loadAvatarUrl(userId).then((u) => { if (alive) setUrl(u); });
            }
        };
        window.addEventListener('lc:avatar-updated', onUpdated);
        return () => {
            alive = false;
            window.removeEventListener('lc:avatar-updated', onUpdated);
        };
    }, [userId, hasAvatar]);

    if (!url) {
        return <>{fallback}</>;
    }

    return (
        <img
            src={url}
            alt=""
            className={className}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
                flexShrink: 0,
                ...style,
            }}
        />
    );
}
