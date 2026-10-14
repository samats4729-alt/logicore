/**
 * Переливающийся фон заставки — общий для телефона (Skia) и браузера (WebGL).
 *
 * Узор шейдера даёт «яркость», а цвет берётся из палитры LogiCore: почти
 * чёрный фон экрана входа → глубокий синий → фирменный синий #1677ff, с
 * холодными бликами. Заставка всегда тёмная: она переходит в тёмный экран
 * входа без вспышки.
 */

const rgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Цвет первого кадра — им же залита системная заставка (app.json), пока приложение грузится. */
export const SPLASH_BASE = '#030712';

export const IRIDESCENCE_PALETTE = {
    c0: rgb(SPLASH_BASE),
    c1: rgb('#06142f'),
    c2: rgb('#0c3a8c'),
    c3: rgb('#2f86ff'),
    accent: rgb('#a9d0ff'),
    vignette: 1.3,
};

/** Скорость переливов: узор живой, но не суетится. */
export const IRIDESCENCE_SPEED = 0.55;

/** Значения для шейдера. Считается на каждом кадре в потоке анимации — поэтому 'worklet'. */
export function iridescenceUniforms(width: number, height: number, time: number) {
    'worklet';
    const p = IRIDESCENCE_PALETTE;
    return {
        uResolution: [width, height, 1],
        uTime: time,
        uC0: p.c0,
        uC1: p.c1,
        uC2: p.c2,
        uC3: p.c3,
        uAccent: p.accent,
        uVignette: p.vignette,
    };
}

/** Тело узора — одно на обе версии. */
const BODY = `
  vec2 vUv = fragCoord / uResolution.xy;
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

  float d = -uTime * 0.5;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += uTime * 0.5;

  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5);

  // Узор лежит примерно в [0.54..1] — растягиваем до [0..1].
  float t = clamp((dot(col, vec3(0.45, 0.35, 0.20)) - 0.54) / 0.46, 0.0, 1.0);
  float glint = clamp((col.b - 0.6) / 0.4, 0.0, 1.0);

  vec3 c = mix(uC0, uC1, smoothstep(0.00, 0.40, t));
  c = mix(c, uC2, smoothstep(0.35, 0.75, t));
  c = mix(c, uC3, smoothstep(0.80, 1.00, t));
  c = mix(c, uAccent, smoothstep(0.6, 1.0, glint) * 0.22);

  // Мягкая виньетка собирает взгляд на знаке в центре.
  vec2 p = vUv - vec2(0.5, 0.45);
  c *= 1.0 - dot(p, p) * uVignette;
`;

const UNIFORMS = `
uniform vec3 uResolution;
uniform float uTime;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uAccent;
uniform float uVignette;
`;

/** Для Skia (телефон). */
export const IRIDESCENCE_SKSL = `${UNIFORMS}
vec4 main(vec2 fragCoord) {
${BODY}
  return vec4(c, 1.0);
}
`;

/** Для WebGL (браузер-предпросмотр): тот же узор, ось Y снизу вверх. */
export const IRIDESCENCE_GLSL = `precision highp float;
${UNIFORMS}
void main() {
  vec2 fragCoord = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
${BODY}
  gl_FragColor = vec4(c, 1.0);
}
`;
