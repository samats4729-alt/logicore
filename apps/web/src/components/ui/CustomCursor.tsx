'use client';

import { useEffect, useRef } from 'react';
import styles from '../../app/page.module.css';

export default function CustomCursor() {
    const dotRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!window.matchMedia('(pointer: fine)').matches) return;

        const dot = dotRef.current;
        const ring = ringRef.current;
        if (!dot || !ring) return;

        const prevCursor = document.body.style.cursor;
        document.body.style.cursor = 'none';

        let mx = 0;
        let my = 0;
        let rx = 0;
        let ry = 0;
        let raf = 0;

        const move = (e: MouseEvent) => {
            mx = e.clientX;
            my = e.clientY;
            dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
        };
        const loop = () => {
            rx += (mx - rx) * 0.18;
            ry += (my - ry) * 0.18;
            ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
            raf = requestAnimationFrame(loop);
        };
        const over = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('a, button, [data-cursor]')) ring.classList.add(styles.cursorGrow);
        };
        const out = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest('a, button, [data-cursor]')) ring.classList.remove(styles.cursorGrow);
        };

        window.addEventListener('mousemove', move);
        document.addEventListener('mouseover', over);
        document.addEventListener('mouseout', out);
        loop();

        return () => {
            document.body.style.cursor = prevCursor;
            cancelAnimationFrame(raf);
            window.removeEventListener('mousemove', move);
            document.removeEventListener('mouseover', over);
            document.removeEventListener('mouseout', out);
        };
    }, []);

    return (
        <>
            <div ref={ringRef} className={styles.cursorRing} aria-hidden="true" />
            <div ref={dotRef} className={styles.cursorDot} aria-hidden="true" />
        </>
    );
}
