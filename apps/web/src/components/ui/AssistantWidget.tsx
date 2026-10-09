'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    ArrowUp, ClipboardList, Compass, FilePlus2, LifeBuoy, ReceiptText, SquarePen, Truck, Users, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Loader from '@/components/ui/Loader';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface Step {
    selector?: string;
    goto?: string;
    say?: string;
    /**
     * Шаг, на котором надо заполнить поле, а не нажать кнопку.
     *
     * Обычный шаг перескакивает от касания подсвеченного элемента — для
     * кнопки это верно, для поля нет: человек кликает в список заказчиков,
     * маршрут тут же уходит вперёд и подсвечивает «Далее», пока форма
     * пустая. Такой шаг ждёт, пока человек сам нажмёт «Дальше».
     */
    fill?: boolean;
}

interface TicketDraft {
    title: string;
    category?: string;
    severity?: string;
    description: string;
    process?: string;
    where?: string;
    expected?: string;
    actual?: string;
    orders?: string[];
}

interface ChatMsg {
    role: 'user' | 'assistant';
    content: string;
    steps?: Step[] | null;
    ticket?: TicketDraft | null;
}

const GREETING: ChatMsg = {
    role: 'assistant',
    content: 'Привет! Я гид LogiCore. Спросите, как что сделать — например «Как создать заявку?». Я проведу по шагам прямо в интерфейсе.',
};

const GREETING_SUPPORT: ChatMsg = {
    role: 'assistant',
    content: 'Опишите проблему — что работает неправильно? Я сверюсь с вашими данными (заявки, счета, оплаты), уточню детали и оформлю обращение разработчику.',
};

/** Частые вопросы — кнопками над полем ввода, чтобы обычный случай не набирать. */
const SUGGESTIONS = {
    guide: [
        { icon: FilePlus2, text: 'Как создать заявку?' },
        { icon: Truck, text: 'Как назначить водителя?' },
        { icon: ReceiptText, text: 'Как выставить счёт?' },
        { icon: Users, text: 'Как добавить контрагента?' },
        { icon: ClipboardList, text: 'Где посмотреть долги заказчиков?' },
    ],
    support: [
        { icon: LifeBuoy, text: 'Не сходится сумма в счёте' },
        { icon: LifeBuoy, text: 'Не вижу свою заявку в списке' },
        { icon: LifeBuoy, text: 'Не сохраняется заявка' },
    ],
} as const;

/** Ширина панели: по умолчанию, меньше и больше которой не тянется. */
const PANEL_W = { initial: 400, min: 340, max: 640 } as const;
const OPEN_KEY = 'lc_assistant_open';
/** Высота шапки кабинета (CompanyTopbar, h-12): ниже неё панель и прилипает при прокрутке. */
const HEADER_H = 48;
const WIDTH_KEY = 'lc_assistant_width';

function parseTicket(text: string): { clean: string; ticket: TicketDraft | null } {
    const match = text.match(/```ticket\s*([\s\S]*?)```/);
    if (!match) return { clean: text.trim(), ticket: null };
    let ticket: TicketDraft | null = null;
    try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed && parsed.title && parsed.description) ticket = parsed;
    } catch {
        ticket = null;
    }
    return { clean: text.replace(match[0], '').trim(), ticket };
}

const SEVERITY_LABEL: Record<string, { text: string; className: string }> = {
    low: { text: 'Низкая', className: 'text-muted-foreground' },
    medium: { text: 'Средняя', className: 'text-amber-700 dark:text-amber-400' },
    high: { text: 'Высокая', className: 'text-red-600 dark:text-red-400' },
};

const CATEGORY_LABEL: Record<string, string> = {
    finance: 'Финансы',
    orders: 'Заявки',
    documents: 'Документы',
    display: 'Отображение',
    other: 'Другое',
};

function parseSteps(text: string): { clean: string; steps: Step[] | null } {
    const stepsMatch = text.match(/```steps\s*([\s\S]*?)```/);
    if (stepsMatch) {
        let steps: Step[] | null = null;
        try {
            const parsed = JSON.parse(stepsMatch[1].trim());
            if (Array.isArray(parsed) && parsed.length > 0) steps = parsed;
        } catch {
            steps = null;
        }
        return { clean: text.replace(stepsMatch[0], '').trim(), steps };
    }
    const actionMatch = text.match(/```action\s*([\s\S]*?)```/);
    if (actionMatch) {
        try {
            const a = JSON.parse(actionMatch[1].trim());
            return { clean: text.replace(actionMatch[0], '').trim(), steps: [a] };
        } catch {
            return { clean: text.replace(actionMatch[0], '').trim(), steps: null };
        }
    }
    return { clean: text.trim(), steps: null };
}

function renderRich(text: string) {
    return text.split('\n').map((line, li) => {
        const cleaned = line.replace(/^\s*[-*•]\s+/, '• ');
        const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
        return (
            <div key={li} style={line.trim() ? undefined : { height: 6 }}>
                {parts.map((p, i) => {
                    const b = p.match(/^\*\*([^*]+)\*\*$/);
                    if (b) return <strong key={i} className="font-semibold">{b[1]}</strong>;
                    return <span key={i}>{p.replace(/\*/g, '')}</span>;
                })}
            </div>
        );
    });
}

const readStore = (key: string) => {
    try { return localStorage.getItem(key); } catch { return null; }
};
const writeStore = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* без памяти — просто не запомним */ }
};

/**
 * ИИ-помощник — панелью справа (владелец, 08.10.2026).
 *
 * Раньше — плавающее окно в углу поверх страницы: закрывало таблицу и
 * кнопки, и спросить «как это сделать», глядя на то самое место, было
 * нельзя. Теперь панель встаёт третьей колонкой после меню и страницы и
 * сдвигает страницу, а не ложится сверху. На телефоне места на колонку
 * нет — там панель во весь экран.
 *
 * Вид — как у чатов-агентов: заголовок, вкладки «Гид / Поддержка», лента
 * сообщений, частые вопросы над полем ввода. Открыта ли панель и её
 * ширина — запоминаются в этом браузере.
 */
export default function AssistantWidget() {
    const router = useRouter();
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const [open, setOpenState] = useState(false);
    const [width, setWidth] = useState<number>(PANEL_W.initial);
    const [mode, setMode] = useState<'guide' | 'support'>('guide');
    const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
    const [supportMessages, setSupportMessages] = useState<ChatMsg[]>([GREETING_SUPPORT]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [ticketSending, setTicketSending] = useState(false);

    const [tourActive, setTourActive] = useState(false);
    const [tipText, setTipText] = useState('');
    const [tipMeta, setTipMeta] = useState({ index: 0, total: 0 });

    const bodyRef = useRef<HTMLDivElement>(null);
    const spacerRef = useRef<HTMLElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const tipRef = useRef<HTMLDivElement>(null);
    const targetElRef = useRef<HTMLElement | null>(null);
    const stepsRef = useRef<Step[]>([]);
    const indexRef = useRef(0);
    const activeRef = useRef(false);
    const openRef = useRef(false);

    /** Открыть или закрыть — и сказать кнопке в шапке, чтобы она показала состояние. */
    const setOpen = useCallback((next: boolean) => {
        openRef.current = next;
        setOpenState(next);
        writeStore(OPEN_KEY, next ? '1' : '0');
        window.dispatchEvent(new CustomEvent('logicore:assistant-state', { detail: { open: next } }));
    }, []);

    // Панель была открыта — открыта и после перезагрузки; ширина — та, что тянули.
    useEffect(() => {
        const w = Number(readStore(WIDTH_KEY));
        if (w >= PANEL_W.min && w <= PANEL_W.max) setWidth(w);
        if (readStore(OPEN_KEY) === '1') setOpen(true);
    }, [setOpen]);

    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [messages, supportMessages, mode, loading, open]);

    // Панель стоит под шапкой и бегущей строкой — вровень с началом
    // страницы (владелец, 08.10.2026: «на уровне с верхом кнопки „Создать
    // заявку“, а не до самого верха»). Прокрутили — прилипает к низу шапки.
    // Место под неё держит колонка справа от страницы, а сама панель стоит
    // поверх этого места: так её высота — всегда до низа окна и не растит
    // страницу (иначе короткая страница начинала бесконечно прокручиваться).
    useEffect(() => {
        if (!open || isMobile) return;
        let raf = 0;
        const follow = () => {
            raf = requestAnimationFrame(follow);
            const spacer = spacerRef.current;
            const dock = dockRef.current;
            if (!spacer || !dock) return;
            const top = `${Math.max(Math.round(spacer.getBoundingClientRect().top), HEADER_H)}px`;
            if (dock.style.top !== top) dock.style.top = top;
        };
        follow();
        return () => cancelAnimationFrame(raf);
    }, [open, isMobile]);

    // Открыли — сразу можно печатать.
    useEffect(() => {
        if (open) window.setTimeout(() => inputRef.current?.focus(), 220);
    }, [open, mode]);

    // Follow the target element every frame (no re-render, smooth on scroll)
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            const ring = ringRef.current;
            const tip = tipRef.current;
            const el = targetElRef.current;
            if (!ring) return;
            if (activeRef.current && el && document.body.contains(el)) {
                const r = el.getBoundingClientRect();
                ring.style.opacity = '1';
                ring.style.top = `${r.top - 6}px`;
                ring.style.left = `${r.left - 6}px`;
                ring.style.width = `${r.width + 12}px`;
                ring.style.height = `${r.height + 12}px`;
                if (tip) {
                    // Подсказка становится под элементом, а если внизу не
                    // помещается — над ним.
                    //
                    // Прежнее правило прижимало её к низу окна, и у кнопки в
                    // подвале страницы подсказка ложилась прямо на неё: гид
                    // показывал «Далее», а нажать было нельзя — палец и курсор
                    // попадали в саму подсказку. На длинном маршруте по мастеру
                    // это останавливало человека намертво.
                    const tipH = tip.offsetHeight || 96;
                    const below = r.bottom + 14;
                    const fitsBelow = below + tipH <= window.innerHeight - 8;
                    tip.style.top = `${fitsBelow ? below : Math.max(8, r.top - tipH - 14)}px`;
                    tip.style.left = `${Math.min(Math.max(r.left, 8), window.innerWidth - 320)}px`;
                    // Хвостик смотрит на элемент: вверх, когда подсказка под
                    // ним, и вниз, когда над.
                    tip.classList.toggle('ai-spot-tip-above', !fitsBelow);
                }
            } else if (ring) {
                ring.style.opacity = '0';
            }
        };
        loop();
        return () => cancelAnimationFrame(raf);
    }, []);

    // Advance when the user clicks the highlighted element
    useEffect(() => {
        if (!tourActive) return;
        const onClick = (e: MouseEvent) => {
            const el = targetElRef.current;
            if (!el) return;
            if (stepsRef.current[indexRef.current]?.fill) return;
            if (el.contains(e.target as Node)) {
                window.setTimeout(() => advance(), 480);
            }
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tourActive]);

    const locate = (i: number) => {
        const step = stepsRef.current[i];
        if (!step) return endTour();
        if (step.goto) router.push(step.goto);
        setTipMeta({ index: i, total: stepsRef.current.length });
        setTipText(step.say || '');

        if (!step.selector) {
            targetElRef.current = null;
            window.setTimeout(() => {
                if (activeRef.current && indexRef.current === i) advance();
            }, 1000);
            return;
        }

        // Ждём элемент десять секунд, а не пять: шаг мастера появляется
        // после проверки формы, а карточка рейса — после загрузки данных.
        let tries = 0;
        const tryFind = () => {
            if (!activeRef.current || indexRef.current !== i) return;
            const el = document.querySelector(step.selector as string) as HTMLElement | null;
            if (el) {
                targetElRef.current = el;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (tries < 40) {
                tries++;
                if (tries === 2) {
                    // На мобильном пункты меню живут в Drawer — просим layout открыть его
                    window.dispatchEvent(new Event('logicore:open-mobile-menu'));
                }
                window.setTimeout(tryFind, 250);
            } else {
                targetElRef.current = null;
                setTipText((step.say || '') + ' — не вижу элемент, откройте нужное меню вручную.');
            }
        };
        tryFind();
    };

    const advance = () => {
        const ni = indexRef.current + 1;
        if (ni >= stepsRef.current.length) return endTour();
        indexRef.current = ni;
        locate(ni);
    };

    const startTour = (steps: Step[]) => {
        stepsRef.current = steps;
        indexRef.current = 0;
        activeRef.current = true;
        setTourActive(true);
        setOpen(false);
        locate(0);
    };

    const endTour = () => {
        activeRef.current = false;
        targetElRef.current = null;
        setTourActive(false);
    };

    /* Помощник больше не рассказывает про нововведения: для них есть своя
       страница «Что нового». Вываливать их в чат при каждом открытии значило
       отодвигать вопрос человека вниз тем, что он уже читал. */
    const handleOpen = () => setOpen(true);

    useEffect(() => {
        const w = window as Window & { __lcAssistantPending?: boolean };
        // Событие дошло — отметка «ждёт открытия» больше не нужна.
        const onOpenAssistant = () => { w.__lcAssistantPending = false; handleOpen(); };
        // Кнопка в шапке — переключатель: открыта панель — закрывает.
        const onToggleAssistant = () => { w.__lcAssistantPending = false; setOpen(!openRef.current); };
        window.addEventListener('logicore:open-assistant', onOpenAssistant);
        window.addEventListener('logicore:toggle-assistant', onToggleAssistant);
        // Помощник подгружается отдельно от страницы. Нажали кнопку раньше,
        // чем он загрузился, — событие ушло в пустоту, и окно не открывалось.
        // Кнопка оставляет отметку — забираем её при загрузке.
        if (w.__lcAssistantPending) {
            w.__lcAssistantPending = false;
            handleOpen();
        }
        return () => {
            window.removeEventListener('logicore:open-assistant', onOpenAssistant);
            window.removeEventListener('logicore:toggle-assistant', onToggleAssistant);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sendPrompt = async (text: string) => {
        if (!text || loading) return;
        const isSupport = mode === 'support';
        const current = isSupport ? supportMessages : messages;
        const setCurrent = isSupport ? setSupportMessages : setMessages;

        const next: ChatMsg[] = [...current, { role: 'user', content: text }];
        setCurrent(next);
        setLoading(true);
        try {
            const payload = next
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role, content: m.content }));
            const res = isSupport
                ? await api.post('/assistant/support', { messages: payload })
                : await api.post('/assistant/chat', { messages: payload, context: pathname });
            const reply: string = res.data?.reply || 'Не удалось получить ответ.';
            if (isSupport) {
                const { clean, ticket } = parseTicket(reply);
                setCurrent((prev) => [...prev, { role: 'assistant', content: clean, ticket }]);
            } else {
                const { clean, steps } = parseSteps(reply);
                setCurrent((prev) => [...prev, { role: 'assistant', content: clean, steps }]);
            }
        } catch {
            setCurrent((prev) => [...prev, { role: 'assistant', content: 'Ошибка связи. Попробуйте ещё раз.' }]);
        } finally {
            setLoading(false);
        }
    };

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        await sendPrompt(text);
    };

    const sendTicket = async (ticket: TicketDraft, msgIndex: number) => {
        if (ticketSending) return;
        setTicketSending(true);
        try {
            const transcript = supportMessages
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role, content: m.content }));
            await api.post('/assistant/support/ticket', { ...ticket, transcript });
            setSupportMessages((prev) => {
                const copy = [...prev];
                if (copy[msgIndex]) copy[msgIndex] = { ...copy[msgIndex], ticket: null };
                return [
                    ...copy,
                    { role: 'assistant', content: 'Обращение отправлено разработчику. Спасибо! Мы разберёмся и починим.' },
                ];
            });
        } catch {
            setSupportMessages((prev) => [...prev, { role: 'assistant', content: 'Не удалось отправить обращение. Попробуйте ещё раз.' }]);
        } finally {
            setTicketSending(false);
        }
    };

    /** Начать разговор заново — во вкладке, где сейчас. */
    const newChat = () => {
        if (loading) return;
        if (mode === 'guide') setMessages([GREETING]);
        else setSupportMessages([GREETING_SUPPORT]);
        setInput('');
    };

    /** Ширина — тянется за левый край панели. */
    const startResize = (e: React.PointerEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = width;
        let last = startW;
        const onMove = (ev: PointerEvent) => {
            last = Math.min(PANEL_W.max, Math.max(PANEL_W.min, startW + (startX - ev.clientX)));
            setWidth(last);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            writeStore(WIDTH_KEY, String(Math.round(last)));
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const current = mode === 'guide' ? messages : supportMessages;
    const fresh = current.length === 1;
    const greeting = current[0];

    return (
        <>
            <aside
                ref={spacerRef}
                data-assistant-panel
                aria-label="ИИ-помощник"
                aria-hidden={!open}
                className={cn(
                    isMobile
                        ? 'fixed inset-0 z-[1600] bg-black/30 backdrop-blur-[2px]'
                        : 'relative shrink-0 transition-[width] duration-200 ease-out',
                    isMobile && !open && 'hidden',
                )}
                style={isMobile ? undefined : { width: open ? width : 0 }}
            >
                {open && (
                    <div
                        ref={dockRef}
                        // Сверху — тот же отступ, что у страницы: верх панели вровень
                        // с первой строкой страницы («Создать заявку», заголовок).
                        className={cn('flex flex-col', isMobile ? 'relative h-full p-2' : 'fixed bottom-0 right-0 z-30 pb-2 pr-2 pt-5')}
                        style={isMobile ? undefined : { width, top: 85 }}
                    >
                        {/* Ручка ширины — на левом краю панели. */}
                        {!isMobile && (
                            <div
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="Изменить ширину помощника"
                                onPointerDown={startResize}
                                className="group absolute bottom-2 left-0 top-5 z-10 w-2 cursor-col-resize"
                            >
                                <span className="absolute inset-y-6 left-[3px] w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-border" />
                            </div>
                        )}

                        <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-solid border-border bg-card text-card-foreground shadow-sm', !isMobile && 'ml-2')}>
                            {/* Шапка: название, новый разговор, закрыть. */}
                            <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
                                <h2 className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">ИИ-помощник</h2>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={newChat} aria-label="Новый разговор" title="Новый разговор">
                                    <SquarePen className="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="-mr-1.5 size-8 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)} aria-label="Закрыть помощника" title="Закрыть">
                                    <X className="size-4" />
                                </Button>
                            </div>

                            {/* Гид или поддержка — те же пилюли, что во вкладках кабинета. */}
                            <div className="px-4 pb-3">
                                <div role="tablist" aria-label="Режим помощника" className="inline-flex rounded-lg bg-muted p-0.5">
                                    {([['guide', 'Гид'], ['support', 'Поддержка']] as const).map(([key, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            role="tab"
                                            aria-selected={mode === key}
                                            onClick={() => setMode(key)}
                                            className={cn(
                                                'h-7 cursor-pointer rounded-md border-0 px-3 text-[12.5px] font-medium [font-family:inherit] transition-colors',
                                                mode === key ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Лента. */}
                            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                                {/* Приветствие — карточкой сверху, как подсказка, а не репликой в ленте. */}
                                <div className="rounded-xl border border-solid border-border bg-muted/50 px-3.5 py-3">
                                    <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
                                        {mode === 'guide' ? <Compass className="size-3.5" /> : <LifeBuoy className="size-3.5" />}
                                        {mode === 'guide' ? 'Гид по LogiCore' : 'Поддержка'}
                                    </div>
                                    <div className="text-[13px] leading-relaxed text-muted-foreground">{greeting.content}</div>
                                </div>

                                {current.slice(1).map((m, j) => {
                                    const i = j + 1;
                                    return m.role === 'user' ? (
                                        <div key={i} className="mt-4 flex justify-end">
                                            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[13.5px] leading-relaxed">
                                                {m.content}
                                            </div>
                                        </div>
                                    ) : (
                                        <div key={i} className="mt-4 text-[13.5px] leading-relaxed">
                                            {renderRich(m.content)}
                                            {m.steps && m.steps.length > 0 && (
                                                <Button size="sm" className="mt-3 h-8 gap-1.5 rounded-lg text-[13px]" onClick={() => startTour(m.steps as Step[])}>
                                                    <Compass className="size-3.5" /> Показать по шагам
                                                </Button>
                                            )}
                                            {m.ticket && (
                                                <div className="mt-3 rounded-xl border border-solid border-border bg-card p-3">
                                                    <div className="mb-1.5 text-[13px] font-semibold">{m.ticket.title}</div>
                                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                                            {CATEGORY_LABEL[m.ticket.category || 'other'] || m.ticket.category}
                                                        </span>
                                                        <span className={cn('rounded-full border border-solid border-border px-2 py-0.5 text-[11px] font-semibold', (SEVERITY_LABEL[m.ticket.severity || 'medium'] || SEVERITY_LABEL.medium).className)}>
                                                            {(SEVERITY_LABEL[m.ticket.severity || 'medium'] || SEVERITY_LABEL.medium).text}
                                                        </span>
                                                    </div>
                                                    {m.ticket.expected && (
                                                        <div className="mb-1 text-[12px]">
                                                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Ожидается: </span>
                                                            <span className="text-muted-foreground">{m.ticket.expected}</span>
                                                        </div>
                                                    )}
                                                    {m.ticket.actual && (
                                                        <div className="mb-2 text-[12px]">
                                                            <span className="font-semibold text-red-600 dark:text-red-400">Фактически: </span>
                                                            <span className="text-muted-foreground">{m.ticket.actual}</span>
                                                        </div>
                                                    )}
                                                    {m.ticket.orders && m.ticket.orders.length > 0 && (
                                                        <div className="mb-2 text-[11.5px] text-muted-foreground">
                                                            Заявки: {m.ticket.orders.join(', ')}
                                                        </div>
                                                    )}
                                                    <Button size="sm" className="h-8 rounded-lg text-[13px]" disabled={ticketSending} onClick={() => sendTicket(m.ticket as TicketDraft, i)}>
                                                        {ticketSending ? 'Отправляем…' : 'Отправить в поддержку'}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {loading && (
                                    <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
                                        <Loader size="small" /> Думаю…
                                    </div>
                                )}
                            </div>

                            {/* Частые вопросы — пока разговор не начат. */}
                            {fresh && !loading && (
                                <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
                                    {SUGGESTIONS[mode].map(({ icon: Icon, text }) => (
                                        <button
                                            key={text}
                                            type="button"
                                            onClick={() => sendPrompt(text)}
                                            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-solid border-border bg-card px-2.5 text-[12px] text-muted-foreground [font-family:inherit] transition-colors hover:bg-accent hover:text-foreground"
                                        >
                                            <Icon className="size-3.5" /> {text}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Поле ввода: Enter — отправить, Shift+Enter — новая строка. */}
                            <div className="px-3 pb-3">
                                <div className="rounded-xl border border-solid border-border bg-muted/40 transition-colors focus-within:border-foreground/30 focus-within:bg-card">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        rows={2}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                                        }}
                                        placeholder={mode === 'guide' ? 'Спросите, как что сделать…' : 'Опишите проблему…'}
                                        className="block max-h-40 min-h-[52px] w-full resize-none border-0 bg-transparent px-3 pt-2.5 text-[13.5px] leading-relaxed text-foreground outline-none [field-sizing:content] [font-family:inherit] placeholder:text-muted-foreground"
                                    />
                                    <div className="flex items-center justify-between px-2 pb-2">
                                        <span className="pl-1 text-[11px] text-muted-foreground">
                                            {mode === 'guide' ? 'Проведёт по шагам прямо на экране' : 'Оформит обращение разработчику'}
                                        </span>
                                        <Button
                                            size="icon"
                                            className="size-7 rounded-full"
                                            onClick={send}
                                            disabled={loading || !input.trim()}
                                            aria-label="Отправить"
                                        >
                                            <ArrowUp className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {tourActive && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1500, pointerEvents: 'none' }}>
                    <div ref={ringRef} className="ai-spot-ring" style={{ opacity: 0 }} />
                    <div ref={tipRef} className="ai-spot-tip" style={{ pointerEvents: 'auto' }}>
                        <div style={{ marginBottom: 10, fontWeight: 500 }}>{tipText}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 11.5, opacity: 0.65, fontWeight: 500 }}>{tipMeta.index + 1} / {tipMeta.total}</span>
                            <span style={{ display: 'flex', gap: 6 }}>
                                <button
                                    onClick={endTour}
                                    className="ai-spot-btn-secondary"
                                >
                                    Закрыть
                                </button>
                                <button
                                    onClick={() => advance()}
                                    className="ai-spot-btn-primary"
                                >
                                    {tipMeta.index + 1 >= tipMeta.total ? 'Готово' : 'Дальше'}
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
