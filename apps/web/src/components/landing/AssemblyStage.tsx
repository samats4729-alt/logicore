'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Bell, Check, ChevronRight, Plus, Search, SlidersHorizontal, Truck } from 'lucide-react';
import styles from './AssemblyStage.module.css';

/**
 * Первый экран: журнал заявок лежит разобранным на части — шапка кабинета,
 * заголовок страницы, полоса управления, строки таблицы, — и по мере
 * прокрутки всё это слетается в целый рабочий экран.
 *
 * Смысл не в украшении: за пять секунд без единого слова видно, что человек
 * получает. Список преимуществ этого не делает.
 *
 * Заголовок страницы живёт внутри этой же сцены и не пропадает: он медленно
 * уезжает вверх, освобождая место собранному экрану. Растворяющийся текст
 * читается как сбой, а не как переход.
 *
 * Как считается сборка. Раздел высокий, внутри него липкая сцена; доля
 * пройденного по разделу пути и есть степень собранности. Она уходит в одну
 * переменную `--p` на сцене, а раскладывают части уже стили. В JS ничего не
 * двигается: на кадр приходится только `transform`.
 */

/**
 * Демонстрационные строки журнала.
 *
 * Названия условные — «Заказчик А», «Перевозчик Б». Правдоподобные имена
 * вроде «ТОО КазТрансЛогистик» брать нельзя: такая компания может
 * существовать, и она окажется на чужом сайте в роли примера, не зная об
 * этом. По той же причине у водителей только буква вместо фамилии.
 */
const ROWS = [
    { n: 'ЗК-2604', from: 'Алматы', to: 'Шымкент', st: 'В пути', c: '#0369a1', cust: 'ТОО «Заказчик А»', carr: 'ИП «Перевозчик А»', drv: 'Водитель А.', plate: '847 KZ 02', rate: '620 000', cost: '470 000', inv: 'АВ-00042' },
    { n: 'ЗК-2603', from: 'Астана', to: 'Костанай', st: 'На выгрузке', c: '#3f6212', cust: 'АО «Заказчик Б»', carr: 'ТОО «Перевозчик Б»', drv: 'Водитель Б.', plate: '777 AA 02', rate: '380 000', cost: '295 000', inv: 'АВ-00041' },
    { n: 'ЗК-2602', from: 'Актобе', to: 'Атырау', st: 'Назначен', c: '#1d4ed8', cust: 'ТОО «Заказчик В»', carr: 'ИП «Перевозчик В»', drv: 'Водитель В.', plate: '012 BCD 04', rate: '450 000', cost: '340 000', inv: '—' },
    { n: 'ЗК-2601', from: 'Тараз', to: 'Шымкент', st: 'Завершён', c: '#15803d', cust: 'ИП «Заказчик Г»', carr: 'ТОО «Перевозчик Г»', drv: 'Водитель Г.', plate: '345 XYZ 08', rate: '210 000', cost: '150 000', inv: 'АВ-00039' },
    { n: 'ЗК-2600', from: 'Павлодар', to: 'Алматы', st: 'Ожидает', c: '#b45309', cust: 'ТОО «Заказчик Д»', carr: '—', drv: '—', plate: '—', rate: '510 000', cost: '—', inv: '—' },
];

/** Что умеет платформа — для бегущей ленты между шапкой и окном. */
const ABILITIES = [
    'Оформление заявок',
    'GPS-мониторинг рейсов',
    'Счета и акты выполненных работ',
    'Взаиморасчёты с контрагентами',
    'Несколько юридических лиц',
    'Доверенности и договоры-заявки',
    'Реестр рейсов и оплат',
    'Встроенный помощник',
];

/**
 * Откуда выезжает часть и на какой доле прокрутки садится на место.
 *
 * Строго по горизонтали, из левого и правого края по очереди, без поворотов
 * и без смещения по вертикали. Разлёт «веером» с наклонами выглядел
 * неряшливо: экран собирался будто из мусора, а не из готовых полос.
 */
const SCATTER = [
    { x: -460, d: 0 },     // шапка кабинета
    { x: 460, d: 0.06 },   // заголовок страницы
    { x: -460, d: 0.12 },  // полоса управления
    { x: 460, d: 0.18 },   // шапка таблицы
    { x: -460, d: 0.24 },  // строки журнала
    { x: 460, d: 0.3 },
    { x: -460, d: 0.36 },
    { x: 460, d: 0.42 },
    { x: -460, d: 0.48 },
];

function pieceStyle(i: number): React.CSSProperties {
    const s = SCATTER[Math.min(i, SCATTER.length - 1)];
    return {
        ['--tx' as string]: `${s.x}px`,
        ['--d' as string]: String(s.d),
        ['--k' as string]: (1 / (1 - s.d)).toFixed(4),
    };
}

export default function AssemblyStage({ children }: { children: React.ReactNode }) {
    const sectionRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const section = sectionRef.current;
        const stage = stageRef.current;
        if (!section || !stage) return;

        // Сборки нет только на телефоне: собирать экран шириной 1180 точек
        // на экране в 375 бессмысленно — деталей не разглядеть, а прокрутка
        // залипает на два экрана впустую. Там страница сразу собрана.
        //
        // Системную настройку «уменьшить движение» здесь не слушаем, и это
        // решение владельца. Обычно её уважают, но она стоит выключенной у
        // многих на рабочих машинах заодно с «производительностью», и
        // первый экран сайта у них молча превращался в статичную картинку.
        // Само движение тут не самостоятельное: экран собирается ровно на
        // столько, на сколько человек прокрутил, и останавливается вместе с
        // ним.
        const still = window.matchMedia('(max-width: 760px)');

        let frame = 0;
        const recalc = () => {
            frame = 0;
            if (still.matches) {
                stage.style.setProperty('--p', '1');
                return;
            }
            const r = section.getBoundingClientRect();
            const path = r.height - window.innerHeight;
            const done = path > 0 ? -r.top / path : 0;
            // Собирается к 80% пути: собранный экран должен постоять на
            // месте, иначе он мелькает и уезжает вверх.
            stage.style.setProperty('--p', Math.min(1, Math.max(0, done / 0.8)).toFixed(3));
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(recalc);
        };

        // Где сейчас курсор — чтобы под ним разгоралась сетка точек.
        // Координаты уходят в переменные, дальше всё делают стили.
        let pointerFrame = 0;
        let px = 0;
        let py = 0;
        const applyPointer = () => {
            pointerFrame = 0;
            stage.style.setProperty('--mx', `${px}px`);
            stage.style.setProperty('--my', `${py}px`);
        };
        const onPointer = (e: PointerEvent) => {
            // Считаем от окна, а не от сцены: сетка живёт внутри окна, и от
            // сцены пятно вставало бы со смещением.
            const target = stage.querySelector(`.${styles.windowWrap}`) || stage;
            const r = target.getBoundingClientRect();
            px = e.clientX - r.left;
            py = e.clientY - r.top;
            stage.style.setProperty('--lit', '1');
            if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
        };
        const onLeave = () => stage.style.setProperty('--lit', '0');

        recalc();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        still.addEventListener('change', recalc);
        stage.addEventListener('pointermove', onPointer);
        stage.addEventListener('pointerleave', onLeave);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            still.removeEventListener('change', recalc);
            stage.removeEventListener('pointermove', onPointer);
            stage.removeEventListener('pointerleave', onLeave);
            if (frame) cancelAnimationFrame(frame);
            if (pointerFrame) cancelAnimationFrame(pointerFrame);
        };
    }, []);

    return (
        <div className={styles.section} ref={sectionRef}>
            <div className={styles.sticky}>
                <div className={styles.stage} ref={stageRef}>
                    {/* Бегущая лента возможностей между шапкой и окном.
                        Гаснет, как только пошла сборка: дальше говорит сам
                        экран, и две бегущие вещи разом спорят друг с другом. */}
                    <div className={styles.ticker} aria-hidden>
                        <div className={styles.tickerTrack}>
                            {[...ABILITIES, ...ABILITIES].map((t, i) => (
                                <span key={i}>{t}</span>
                            ))}
                        </div>
                    </div>

                    {/* Заголовок не растворяется — медленно уезжает вверх. */}
                    <div className={styles.copy}>{children}</div>


                    <div className={styles.windowWrap}>
                        {/* Рамка окна отдельным слоем: части летают поверх неё
                            и не обрезаются её краями. */}
                        <div className={styles.frame} aria-hidden>
                            {/* Сетка точек в пустом окне: под курсором она
                                разгорается — пустой экран отзывается на
                                движение и не выглядит заглушкой. Гаснет по
                                мере того, как окно заполняется. */}
                            <div className={styles.dots} aria-hidden />
                            <div className={styles.dotsLit} aria-hidden />
                            {/* Под курсором точки становятся нулями и
                                единицами. Две плитки с разными цифрами
                                перемигиваются — код читается живым, а не
                                напечатанным один раз. */}
                            <div className={styles.code} aria-hidden />
                            <div className={`${styles.code} ${styles.codeAlt}`} aria-hidden />
                        </div>

                        <div className={styles.window}>
                            <div className={styles.piece} style={pieceStyle(0)}>
                                <div className={styles.appBar}>
                                    <span className={styles.appBrand}>Logi<span>Core</span></span>
                                    <span className={styles.navPills}>
                                        <span>Дашборд</span>
                                        <span className={styles.navActive}>Заявки</span>
                                        <span>Мониторинг</span>
                                        <span>Финансы</span>
                                        <span>Кабинет</span>
                                    </span>
                                    <span className={styles.appRight}>
                                        <i><Search size={12} /></i>
                                        <i><Bell size={12} /></i>
                                        <span className={styles.profile}>
                                            <Image src="/driver-avatar.png" alt="" width={26} height={26} className={styles.avatar} />
                                            <span className={styles.profileText}>
                                                <b>Ерлан Мұратов</b>
                                                <u>Администратор</u>
                                            </span>
                                        </span>
                                    </span>
                                </div>
                            </div>

                            <div className={styles.page}>
                                <div className={styles.piece} style={pieceStyle(1)}>
                                    <div className={styles.pageHead}>
                                        <div>
                                            <div className={styles.eyebrow}>Заявки · журнал</div>
                                            <div className={styles.pageTitle}>Заявки компании</div>
                                        </div>
                                        <span className={styles.createBtn}><Plus size={12} /> Создать заявку</span>
                                    </div>
                                </div>

                                <div className={styles.card}>
                                    <div className={styles.piece} style={pieceStyle(2)}>
                                        <div className={styles.controls}>
                                            <span className={styles.tab}>Все заявки <b>37</b></span>
                                            <span className={styles.tabMuted}>Архив 12</span>
                                            <span className={styles.search}><Search size={11} /> Номер, город, заказчик…</span>
                                            <span className={styles.control}><SlidersHorizontal size={11} /> Фильтры</span>
                                            <span className={styles.selected}>Всего 37</span>
                                        </div>
                                    </div>

                                    <div className={styles.piece} style={pieceStyle(3)}>
                                        <div className={`${styles.tr} ${styles.th}`}>
                                            <span>Статус</span>
                                            <span>№</span>
                                            <span>Заказчик</span>
                                            <span>Перевозчик</span>
                                            <span>Водитель</span>
                                            <span>Транспорт</span>
                                            <span>Маршрут</span>
                                            <span className={styles.right}>Ставка зак.</span>
                                            <span className={styles.right}>Ставка перев.</span>
                                            <span>Счёт</span>
                                            <span />
                                        </div>
                                    </div>

                                    {ROWS.map((r, i) => (
                                        <div className={styles.piece} style={pieceStyle(4 + i)} key={r.n}>
                                            <div className={styles.tr}>
                                                <span>
                                                    <span className={styles.pill}>
                                                        <i style={{ background: r.c }}>
                                                            {r.st === 'Завершён'
                                                                ? <Check size={8} strokeWidth={3.6} />
                                                                : <Truck size={8} strokeWidth={3} />}
                                                        </i>
                                                        {r.st}
                                                    </span>
                                                </span>
                                                <span className={styles.num}>{r.n}</span>
                                                <span className={styles.ell}>{r.cust}</span>
                                                <span className={styles.ell}>{r.carr}</span>
                                                <span className={styles.ell}>{r.drv}</span>
                                                <span>{r.plate}</span>
                                                <span className={styles.route}>
                                                    {r.from} → {r.to}
                                                    <i style={{ background: r.c }} />
                                                </span>
                                                <span className={styles.right}>{r.rate}</span>
                                                <span className={`${styles.right} ${styles.neg}`}>{r.cost}</span>
                                                <span className={r.inv === '—' ? styles.muted : styles.accent}>{r.inv}</span>
                                                <span className={styles.chev}><ChevronRight size={11} /></span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Свечение внизу: первый экран переливается в цвет
                        следующего блока, стыка не видно. */}
                    <div className={styles.glow} aria-hidden />
                </div>
            </div>
        </div>
    );
}
