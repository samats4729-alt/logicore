'use client';

import { useEffect, useRef } from 'react';

export default function HeroNetwork() {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const parent = canvas.parentElement;
        if (!ctx || !parent) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = 0;
        let H = 0;
        let nodes: { x: number; y: number; vx: number; vy: number }[] = [];
        const mouse = { x: -9999, y: -9999 };

        const resize = () => {
            W = parent.clientWidth;
            H = parent.clientHeight;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            canvas.style.width = `${W}px`;
            canvas.style.height = `${H}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const count = Math.min(110, Math.max(36, Math.floor((W * H) / 16000)));
            nodes = [];
            for (let i = 0; i < count; i++) {
                nodes.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    vx: (Math.random() - 0.5) * 0.35,
                    vy: (Math.random() - 0.5) * 0.35,
                });
            }
        };
        resize();

        const onMove = (e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            mouse.x = e.clientX - r.left;
            mouse.y = e.clientY - r.top;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('resize', resize);

        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            ctx.clearRect(0, 0, W, H);

            for (const n of nodes) {
                n.x += n.vx;
                n.y += n.vy;
                if (n.x < 0 || n.x > W) n.vx *= -1;
                if (n.y < 0 || n.y > H) n.vy *= -1;

                const dx = n.x - mouse.x;
                const dy = n.y - mouse.y;
                const md = Math.hypot(dx, dy);
                if (md < 140 && md > 0) {
                    n.x += (dx / md) * 0.7;
                    n.y += (dy / md) * 0.7;
                }

                ctx.beginPath();
                ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(120, 160, 235, 0.6)';
                ctx.fill();
            }

            for (let a = 0; a < nodes.length; a++) {
                for (let b = a + 1; b < nodes.length; b++) {
                    const p = nodes[a];
                    const q = nodes[b];
                    const d = Math.hypot(p.x - q.x, p.y - q.y);
                    if (d < 130) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(q.x, q.y);
                        ctx.strokeStyle = `rgba(77, 124, 255, ${0.18 * (1 - d / 130)})`;
                        ctx.lineWidth = 0.7;
                        ctx.stroke();
                    }
                }
            }
        };
        tick();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={ref}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
        />
    );
}
