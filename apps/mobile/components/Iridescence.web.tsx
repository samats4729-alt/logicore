import { useEffect, useRef } from 'react';
import { IRIDESCENCE_GLSL, IRIDESCENCE_SPEED, SPLASH_BASE, iridescenceUniforms } from '@/lib/iridescence';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** То немногое из WebGL, что нужно узору. */
type WebGL = Record<string, any>;
/** И от холста — только размеры и контекст. */
type Canvas = { getContext(kind: string): unknown; clientWidth: number; clientHeight: number; width: number; height: number };

const VERTEX = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/**
 * Браузер-предпросмотр: тот же узор, что на телефоне, но на WebGL — Skia в
 * браузере требует отдельной загрузки и для предпросмотра не нужна. Нет
 * WebGL — остаётся просто тёмный фон.
 */
export function Iridescence() {
    const ref = useRef<Canvas | null>(null);

    useEffect(() => {
        const canvas = ref.current;
        // Типы браузера в проекте урезаны (нет WebGL) — описываем контекст сами.
        const gl = canvas?.getContext('webgl') as WebGL | null;
        if (!canvas || !gl) return;
        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('Iridescence:', gl.getShaderInfoLog(s));
            return s;
        };
        const prog = gl.createProgram()!;
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, IRIDESCENCE_GLSL));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        let frame = 0;
        const start = performance.now();
        const draw = () => {
            const dpr = Math.min((globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1, 2);
            const w = Math.round(canvas.clientWidth * dpr);
            const h = Math.round(canvas.clientHeight * dpr);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            gl.viewport(0, 0, w, h);
            const u = iridescenceUniforms(w, h, ((performance.now() - start) / 1000) * IRIDESCENCE_SPEED);
            gl.uniform3fv(gl.getUniformLocation(prog, 'uResolution'), u.uResolution);
            gl.uniform1f(gl.getUniformLocation(prog, 'uTime'), u.uTime);
            gl.uniform3fv(gl.getUniformLocation(prog, 'uC0'), u.uC0);
            gl.uniform3fv(gl.getUniformLocation(prog, 'uC1'), u.uC1);
            gl.uniform3fv(gl.getUniformLocation(prog, 'uC2'), u.uC2);
            gl.uniform3fv(gl.getUniformLocation(prog, 'uC3'), u.uC3);
            gl.uniform3fv(gl.getUniformLocation(prog, 'uAccent'), u.uAccent);
            gl.uniform1f(gl.getUniformLocation(prog, 'uVignette'), u.uVignette);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            frame = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <canvas
            ref={ref as never}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: SPLASH_BASE }}
        />
    );
}
