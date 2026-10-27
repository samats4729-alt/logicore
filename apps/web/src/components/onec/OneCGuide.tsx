'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import styles from './OneCGuide.module.css';

/** Прямоугольник на кадре — в точках кадра 800×688. */
interface Box { x: number; y: number; w: number; h: number }

interface Beat {
    src: string;
    caption: string;
    /** Куда ведёт курсор и что подсвечено. */
    at: Box;
    /** Что впечатывается в поле на этом шаге. */
    type?: string;
    /** Уже вписанное раньше — остаётся видно в поле. */
    filled?: { box: Box; text: string };
}

interface Chapter {
    title: string;
    beats: Beat[];
}

const W = 800;
const H = 688;
/** Пример адреса — настоящий ключ в инструкции не показываем никогда. */
const SAMPLE = 'https://app.logicore.kz/1c/cm8k2w…/Hq7rTb…';

/**
 * Облако — настоящая «Бухгалтерия для Казахстана» в 1cFresh, снятая
 * 23.10.2026 при подключении к LogiCore. Начиная с «1С нашла LogiCore» окна
 * в облаке и в 1С на компьютере одинаковые — эти кадры общие.
 */
const f = (n: number) => `/onec-guide/${String(n).padStart(2, '0')}.jpg`;
/** 1С на компьютере — учебная «Бухгалтерия» в окне 1000×860, снята 24.10.2026. */
const d = (name: string) => `/onec-guide/desktop/${name}.jpg`;

const CLOUD_ADDRESS: Box = { x: 296, y: 195, w: 294, h: 18 };
const DESKTOP_ADDRESS: Box = { x: 190, y: 175, w: 324, h: 15 };
const DESKTOP_NEXT: Box = { x: 579, y: 566, w: 66, h: 21 };

const AFTER_ADDRESS: Beat[] = [
    { src: f(10), caption: '1С нашла LogiCore — «Далее»', at: { x: 601, y: 564, w: 46, h: 20 } },
    { src: f(11), caption: 'Подключение готово — «Готово»', at: { x: 655, y: 564, w: 40, h: 20 } },
];
const FIRST_EXPORT_START: Beat[] = [
    { src: f(12), caption: 'Нажмите «Настроить правила отправки и получения данных»', at: { x: 193, y: 152, w: 250, h: 17 } },
    { src: f(13), caption: 'Ничего не меняйте — «Записать и закрыть»', at: { x: 178, y: 149, w: 92, h: 18 } },
    { src: f(14), caption: 'Нажмите «Выполнить начальную выгрузку данных»', at: { x: 193, y: 196, w: 200, h: 17 } },
    { src: f(15), caption: 'Нажмите «Далее»', at: { x: 581, y: 413, w: 46, h: 20 } },
];
const DONE: Beat = { src: f(16), caption: 'Готово! Дальше 1С обменивается с LogiCore сама', at: { x: 634, y: 413, w: 42, h: 20 } };

export const GUIDES = {
    cloud: {
        label: '1С в облаке',
        chapters: [
            {
                title: 'Создать подключение',
                beats: [
                    { src: f(1), caption: '«Администрирование» → «Синхронизация данных»', at: { x: 214, y: 271, w: 140, h: 20 } },
                    { src: f(2), caption: 'Нажмите «Настройки синхронизации данных»', at: { x: 192, y: 101, w: 160, h: 18 } },
                    { src: f(3), caption: 'Нажмите «Ещё»', at: { x: 716, y: 78, w: 38, h: 20 } },
                    { src: f(4), caption: 'Выберите «Создать»', at: { x: 432, y: 292, w: 120, h: 18 } },
                    { src: f(5), caption: 'Выберите «Другая программа»', at: { x: 200, y: 612, w: 90, h: 16 } },
                ],
            },
            {
                title: 'Вставить адрес',
                beats: [
                    { src: f(6), caption: 'Нажмите «Настроить параметры подключения»', at: { x: 214, y: 132, w: 206, h: 18 } },
                    { src: f(7), caption: 'Нажмите «Настроить вручную…»', at: { x: 678, y: 612, w: 98, h: 16 } },
                    { src: f(8), caption: 'Оставьте «Подключение через Интернет» → «Далее»', at: { x: 673, y: 633, w: 52, h: 20 } },
                    { src: f(9), caption: 'Вставьте «Адрес для 1С» из LogiCore', at: CLOUD_ADDRESS, type: SAMPLE },
                    {
                        src: f(9), caption: 'Пользователь и пароль не нужны — «Далее»', at: { x: 673, y: 633, w: 52, h: 20 },
                        filled: { box: CLOUD_ADDRESS, text: SAMPLE },
                    },
                    ...AFTER_ADDRESS,
                ],
            },
            { title: 'Первая выгрузка', beats: [...FIRST_EXPORT_START, DONE] },
        ] as Chapter[],
    },
    desktop: {
        label: '1С на компьютере',
        chapters: [
            {
                title: 'Создать подключение',
                beats: [
                    { src: d('d01'), caption: '«Администрирование» → «Синхронизация данных»', at: { x: 178, y: 309, w: 122, h: 20 } },
                    { src: d('d02'), caption: 'Нажмите «Настройки синхронизации данных»', at: { x: 509, y: 112, w: 168, h: 18 } },
                    { src: d('d03'), caption: 'Нажмите «Создать» — если кнопки не видно, она в «Ещё»', at: { x: 704, y: 86, w: 50, h: 19 } },
                    { src: d('d04'), caption: 'Выберите «Создать»', at: { x: 442, y: 311, w: 74, h: 18 } },
                    { src: d('d05'), caption: 'Выберите «Другая программа»', at: { x: 165, y: 461, w: 94, h: 18 } },
                ],
            },
            {
                title: 'Вставить адрес',
                beats: [
                    { src: d('d06'), caption: 'Нажмите «Настроить параметры подключения»', at: { x: 181, y: 188, w: 196, h: 16 } },
                    { src: d('d07'), caption: 'Выберите «Подключение к другой программе через Интернет»', at: { x: 100, y: 222, w: 248, h: 16 } },
                    { src: d('d08'), caption: 'Нажмите «Далее»', at: DESKTOP_NEXT },
                    { src: d('d09'), caption: 'Вставьте «Адрес для 1С» из LogiCore', at: DESKTOP_ADDRESS, type: SAMPLE },
                    {
                        src: d('d09'), caption: 'Пользователь и пароль не нужны — «Далее»', at: DESKTOP_NEXT,
                        filled: { box: DESKTOP_ADDRESS, text: SAMPLE },
                    },
                    ...AFTER_ADDRESS,
                ],
            },
            {
                title: 'Первая выгрузка',
                beats: [
                    ...FIRST_EXPORT_START,
                    // 1С на компьютере спрашивает пароль, если при вводе адреса не отмечено «Запомнить пароль».
                    { src: d('d_password'), caption: 'Спросит пароль — вставьте его из LogiCore («Если 1С попросит пароль»)', at: { x: 236, y: 334, w: 176, h: 24 } },
                    DONE,
                ],
            },
        ] as Chapter[],
    },
};

export type GuideVariant = keyof typeof GUIDES;

const pct = (b: Box) => ({ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` });
const center = (b: Box) => ({ left: `${((b.x + b.w / 2) / W) * 100}%`, top: `${((b.y + b.h / 2) / H) * 100}%` });

type Phase = 'move' | 'click' | 'type' | 'hold';

/**
 * Мини-видео «как подключить 1С» — как гифка, но из настоящих экранов 1С:
 * курсор сам едет к нужной кнопке, подсветка, щелчок и подпись, что
 * нажать. Две версии — облачная 1С и 1С на компьютере: первые шаги у них
 * разные. Можно остановить, листать и перейти к нужной главе.
 */
export function OneCGuide({ className }: { className?: string }) {
    const [variant, setVariant] = useState<GuideVariant>('cloud');
    const chapters = GUIDES[variant].chapters;
    const beats = useMemo(() => chapters.flatMap((c, ci) => c.beats.map((b, bi) => ({ ...b, chapter: ci, step: bi }))), [chapters]);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [phase, setPhase] = useState<Phase>('move');
    const [typed, setTyped] = useState(0);
    const [cursorAt, setCursorAt] = useState<Box>({ x: 380, y: 380, w: 0, h: 0 });
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const beat = beats[Math.min(index, beats.length - 1)];

    // Без анимаций, если человек их выключил в системе: листает сам.
    useEffect(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
    }, []);

    // Следующий кадр — заранее, чтобы не мигал.
    useEffect(() => {
        const next = beats[(index + 1) % beats.length];
        const img = new Image();
        img.src = next.src;
    }, [index, beats]);

    useEffect(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

        setTyped(0);
        setPhase('move');
        // Курсор едет к цели со своего прошлого места (переход по CSS).
        later(30, () => setCursorAt(beat.at));
        if (!playing) {
            setPhase('hold');
            if (beat.type) setTyped(beat.type.length);
            return () => timers.current.forEach(clearTimeout);
        }
        later(850, () => setPhase('click'));
        let t = 1150;
        if (beat.type) {
            later(t, () => setPhase('type'));
            for (let i = 1; i <= beat.type.length; i++) later(t + i * 40, () => setTyped(i));
            t += beat.type.length * 40 + 200;
        }
        later(t, () => setPhase('hold'));
        later(t + 1500, () => setIndex((i) => (i + 1) % beats.length));
        return () => timers.current.forEach(clearTimeout);
    }, [index, playing, beat, beats.length]);

    const go = (i: number) => setIndex((i + beats.length) % beats.length);
    const chapterStart = (ci: number) => beats.findIndex((b) => b.chapter === ci);
    const inChapter = chapters[beat.chapter].beats.length;
    const choose = (v: GuideVariant) => {
        setVariant(v);
        setIndex(0);
    };

    return (
        // Не шире 720: на экране 1920×1080 видео целиком помещается без прокрутки.
        <div className={cn('w-full max-w-[720px] space-y-2', className)}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full bg-muted p-0.5" role="tablist" aria-label="Где у вас 1С">
                    {(Object.keys(GUIDES) as GuideVariant[]).map((v) => (
                        <button
                            key={v}
                            type="button"
                            role="tab"
                            aria-selected={v === variant}
                            onClick={() => choose(v)}
                            className={cn(
                                'h-7 rounded-full px-3 text-[12px] font-medium transition-colors',
                                v === variant ? 'bg-background text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {GUIDES[v].label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1">
                    {chapters.map((c, ci) => (
                        <button
                            key={c.title}
                            type="button"
                            onClick={() => go(chapterStart(ci))}
                            className={cn(
                                'h-7 rounded-full px-3 text-[12px] font-medium transition-colors',
                                ci === beat.chapter ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {ci + 1}. {c.title}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.screen}>
                {/* eslint-disable-next-line @next/next/no-img-element -- кадр меняется каждую секунду, next/image тут лишний */}
                <img src={beat.src} alt={beat.caption} className={styles.frame} draggable={false} />
                {/* Имя пользователя облачной 1С в углу — размыто. */}
                {!beat.src.includes('/desktop/') && <div className={styles.mask} style={pct({ x: 726, y: 4, w: 48, h: 20 })} aria-hidden />}
                {beat.filled && (
                    <div className={styles.typed} style={pct(beat.filled.box)} aria-hidden>{beat.filled.text}</div>
                )}
                {beat.type && (phase === 'type' || phase === 'hold') && (
                    <div className={styles.typed} style={pct(beat.at)} aria-hidden>
                        {beat.type.slice(0, typed)}
                        {phase === 'type' && <span className={styles.caret} />}
                    </div>
                )}
                <div className={cn(styles.target, phase !== 'move' && styles.targetOn)} style={pct(beat.at)} aria-hidden />
                {phase === 'click' && <div key={`${variant}-${index}`} className={styles.ripple} style={center(beat.at)} aria-hidden />}
                <svg className={styles.cursor} style={center(cursorAt)} viewBox="0 0 24 24" aria-hidden>
                    <path d="M4 2l15 9.5-6.6 1.4 3.8 7.4-2.8 1.4-3.8-7.4L4 19z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
            </div>

            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(index - 1)} aria-label="Предыдущий шаг">
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Пауза' : 'Смотреть'}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(index + 1)} aria-label="Следующий шаг">
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <p className="m-0 min-w-0 flex-1 text-[13px] font-medium" aria-live="polite">{beat.caption}</p>
                <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{beat.step + 1} из {inChapter}</span>
            </div>
        </div>
    );
}
