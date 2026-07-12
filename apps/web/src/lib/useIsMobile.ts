'use client';

import { useEffect, useState } from 'react';

/**
 * Мобильный брейкпоинт платформы — тот же, что в company/layout.tsx (< 1024px).
 * До гидратации возвращает false, чтобы SSR-разметка совпадала с десктопной.
 */
export function useIsMobile(breakpoint = 1024): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < breakpoint);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [breakpoint]);

    return isMobile;
}
