'use client';

import { useRef, ReactNode } from 'react';
import styles from '../../app/page.module.css';

export default function InteractiveCard({
    className = '',
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);

    const onMove = (e: React.MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', `${px * 100}%`);
        el.style.setProperty('--my', `${py * 100}%`);
        el.style.setProperty('--rx', `${(0.5 - py) * 6}deg`);
        el.style.setProperty('--ry', `${(px - 0.5) * 6}deg`);
    };

    const onLeave = () => {
        const el = ref.current;
        if (!el) return;
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--mx', '50%');
        el.style.setProperty('--my', '50%');
    };

    return (
        <div
            ref={ref}
            data-cursor
            className={`${styles.iCard} ${className}`}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
        >
            {children}
        </div>
    );
}
