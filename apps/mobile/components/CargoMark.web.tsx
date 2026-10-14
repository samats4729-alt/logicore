import { useEffect, useRef } from 'react';
import { ACCENT, CARGO, INK, LOGO_BOX, LOGO_INNER, LOGO_OUTER, SPEED_LINE, cargoFrame, logoPlacement } from '@/lib/cargo-splash';

/* Типы браузера в проекте урезаны — описываем нужное от SVG сами. */
type SvgEl = { setAttribute(name: string, value: string): void; getTotalLength?(): number };

const BLOCK_RIGHT = 772 - LOGO_BOX.x;
const LINES = [{ dy: 12, dx: 0, len: 26 }, { dy: 24, dx: 8, len: 32 }, { dy: 36, dx: 16, len: 38 }];

/** Браузер-предпросмотр: тот же знак и то же расписание, что на телефоне (`CargoMark.tsx`), но на SVG. */
export function CargoMark({ cx, cy, width, screenWidth, screenHeight }: {
    cx: number;
    cy: number;
    width: number;
    screenWidth: number;
    screenHeight: number;
}) {
    const outerStroke = useRef<SvgEl | null>(null);
    const outerFill = useRef<SvgEl | null>(null);
    const block = useRef<SvgEl | null>(null);
    const lines = useRef<(SvgEl | null)[]>([]);
    const dot = useRef<SvgEl | null>(null);
    const p = logoPlacement(cx, cy, width);
    const u = width / 118;

    useEffect(() => {
        const L = outerStroke.current?.getTotalLength?.() ?? 3000;
        outerStroke.current?.setAttribute('stroke-dasharray', `${L} ${L}`);
        const start = performance.now();
        let raf = 0;
        const tick = () => {
            const t = Math.min(CARGO.total, performance.now() - start);
            const f = cargoFrame(t);
            outerStroke.current?.setAttribute('stroke-dashoffset', String(L * (1 - f.draw)));
            outerFill.current?.setAttribute('fill-opacity', String(f.fill));
            outerStroke.current?.setAttribute('stroke-opacity', String(f.stroke));
            block.current?.setAttribute('transform', `translate(${f.slide} 0)`);
            block.current?.setAttribute('opacity', String(f.blockOn));
            const right = p.x + (BLOCK_RIGHT + f.slide) * p.s;
            lines.current.forEach((l, i) => {
                const x = right + (8 + LINES[i].dx) * u;
                l?.setAttribute('x1', String(x));
                l?.setAttribute('x2', String(x + LINES[i].len * u));
                l?.setAttribute('opacity', String(f.speed));
            });
            dot.current?.setAttribute('r', String(5 * u * f.dot));
            if (t < CARGO.total) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const logoT = `translate(${p.x} ${p.y}) scale(${p.s}) translate(${-LOGO_BOX.x} ${-LOGO_BOX.y})`;
    return (
        <svg
            width={screenWidth}
            height={screenHeight}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
            <g transform={logoT}>
                <path ref={outerStroke as never} d={LOGO_OUTER} fill="none" stroke={INK} strokeWidth={14} strokeLinejoin="round" />
                <path ref={outerFill as never} d={LOGO_OUTER} fill={INK} fillRule="evenodd" fillOpacity={0} />
                <path ref={block as never} d={LOGO_INNER} fill={INK} opacity={0} />
            </g>
            {LINES.map((l, i) => (
                <line
                    key={i}
                    ref={((el: SvgEl | null) => { lines.current[i] = el; }) as never}
                    y1={cy + l.dy * u}
                    y2={cy + l.dy * u}
                    stroke={SPEED_LINE}
                    strokeWidth={3 * u}
                    strokeLinecap="round"
                    opacity={0}
                />
            ))}
            <circle ref={dot as never} cx={cx + 0.49 * width} cy={cy - 0.347 * width} r={0} fill={ACCENT} />
        </svg>
    );
}
