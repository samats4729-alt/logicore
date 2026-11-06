'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useTheme } from '@/components/ThemeProvider';
import PaymentMarks from '@/components/public/PaymentMarks';
import Loader from '@/components/ui/Loader';
import {
    OrdersJournal,
    RouteSketch,
    StepCarrier,
    StepMoney,
    StepOrder,
    StepTracking,
    TripDocuments,
} from '@/components/landing/LandingVisuals';
import styles from './landing.module.css';

/**
 * Главная страница (её содержимое; сама страница — `page.tsx`).
 *
 * Эталон — холст «Главная страница — макет», согласованный владельцем
 * 06.11.2026: строгая сетка (название раздела слева, содержимое справа,
 * тонкие линии), продукт показан настоящими экранами, светлая тема — только
 * белый и чёрный, тёмная — тёплый серый кабинета. Без ИИ-приёмов: огромных
 * цифр, плашек над разделами, галочек у каждой строки.
 *
 * Страница целиком приходит готовой с сервера: поисковик и превью ссылки
 * видят текст сразу, а не одно слово «Загрузка». Все кнопки — настоящие
 * ссылки, поисковик по ним проходит на регистрацию и вход.
 */

const NAV = [
    { href: '#как', label: 'Как это работает' },
    { href: '#возможности', label: 'Возможности' },
    { href: '#рейс', label: 'Мониторинг' },
    { href: '#кому', label: 'Кому подходит' },
    { href: '#тариф', label: 'Тариф' },
];

const STRIP = 'Оформление заявок · GPS-мониторинг рейсов · Счета и акты выполненных работ · Взаиморасчёты с контрагентами · Несколько юридических лиц · Доверенности и договоры-заявки · Реестр рейсов и оплат · Встроенный помощник';

const STEPS = [
    { title: 'Оформление заявки', text: 'Груз, маршрут и ставки заполняются в одной форме. Реквизиты контрагента подтягиваются по БИН.', Visual: StepOrder },
    { title: 'Назначение перевозчика', text: 'Штатный водитель, партнёр-перевозчик или публикация рейса на бирже грузов.', Visual: StepCarrier },
    { title: 'Контроль рейса', text: 'Статусы и координаты транспорта обновляются в реальном времени и видны обеим сторонам.', Visual: StepTracking },
    { title: 'Закрытие расчётов', text: 'Счета, акты и доверенности формируются автоматически, маржа считается по каждому рейсу.', Visual: StepMoney },
];

const MONITORING = [
    'Координаты транспорта и пройденная часть маршрута',
    'Статусы от погрузки до выгрузки — синхронно у всех участников',
    'Заказчик видит те же данные, что и логист',
];

const FEATURES = [
    { title: 'Заявки и биржа грузов', text: 'Оформление заявки, назначение перевозчика и публикация рейса на бирже.' },
    { title: 'GPS-мониторинг', text: 'Положение транспорта на карте и статусы рейса от погрузки до выгрузки.' },
    { title: 'Финансы и взаиморасчёты', text: 'Реестр рейсов, движение денежных средств, прибыль и задолженность по каждому контрагенту.' },
    { title: 'Документооборот', text: 'Счета, акты выполненных работ и доверенности формируются автоматически.' },
    { title: 'Несколько юридических лиц', text: 'Все организации в одном аккаунте, общий список дел с фильтром по организации.' },
    { title: 'Встроенный помощник', text: 'Отвечает на вопросы по работе с системой и подсказывает следующий шаг.' },
];

const AUDIENCES = [
    {
        title: 'Экспедиторским компаниям', items: [
            'Заявки, перевозчики и биржа в одном рабочем окне',
            'Маржа рассчитывается по каждому рейсу',
            'Взаиморасчёты и счета без внешних таблиц',
            'Несколько юридических лиц в одном аккаунте',
        ],
    },
    {
        title: 'Грузовладельцам', items: [
            'Актуальный статус каждой перевозки',
            'Подтверждение факта выполнения рейса',
            'История перевозок и документы по каждому заказу',
            'Отдельный кабинет с необходимым минимумом функций',
        ],
    },
    {
        title: 'Перевозчикам', items: [
            'Заявки от экспедиторов или заказчиков',
            'Назначение своих водителей и транспорта',
            'Подтверждение выполнения рейса',
            'Акты и взаиморасчёты по каждому рейсу',
        ],
    },
];

/**
 * Что компания получает за эти деньги — пока владелец не завёл свой список
 * в админке.
 *
 * Список существительных («заявки, документы и печатные формы») ничего не
 * обещает: так можно описать и блокнот. Каждая строка называет работу,
 * которая перестанет отнимать время, — и проверяема на демонстрации.
 *
 * Пункта «сотрудники без ограничения по числу» здесь нет намеренно: платим
 * как раз за каждого сотрудника, и такое обещание рядом с ценой читалось бы
 * как обман.
 *
 * Строку о приложении водителя на макете убрали (оно ещё на тестировании),
 * но с рабочего сайта владелец её снимать пока не велел (06.11.2026).
 */
const TARIFF_FEATURES = [
    'Заявка на перевозку — от запроса цены до закрытых документов',
    'Договор-заявка, доверенность, счёт и акт заполняются сами',
    'Взаиморасчёты с заказчиками и перевозчиками, акт сверки за минуту',
    'Где машина сейчас — видно на карте, без звонков водителю',
    'Приложение водителю: рейс, фото накладных, статусы с дороги',
];

// Вошедшего человека, который перешёл сюда из кабинета, уводим обратно
// до первой отрисовки — чтобы главная не мелькнула. На сервере такого
// эффекта нет, там обычный.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface Tariff {
    paid: boolean;
    /** Цена за одного пользователя в месяц: сумма растёт с числом сотрудников. */
    pricePerUser: number;
    trialDays: number;
    features: string[];
}

const money = (n: number) => n.toLocaleString('ru-RU');

export default function HomeLanding({ initialTariff }: { initialTariff: Tariff | null }) {
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();
    const { theme, setTheme } = useTheme();
    const [hydrated, setHydrated] = useState(false);
    // Цену сервер подставляет сразу, чтобы в готовой странице не стояло
    // «Бесплатно» до ответа; запрос ниже её освежает.
    const [tariff, setTariff] = useState<Tariff | null>(initialTariff);
    /** Калькулятор тарифа: сколько сотрудников — столько и платят (задачи шефа, N3). */
    const [seats, setSeats] = useState(5);
    /** Меню на телефоне: разделы и вход спрятаны за кнопкой в шапке. */
    const [menuOpen, setMenuOpen] = useState(false);

    useBrowserLayoutEffect(() => {
        setHydrated(true);
    }, []);

    // Цена приходит с сервера: владелец меняет её в админке, и страница
    // показывает новую сумму без пересборки.
    useEffect(() => {
        api.get('/public/billing/tariff')
            .then((res) => setTariff(res.data))
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (!hydrated || !isAuthenticated || !user) return;
        switch (user.role) {
            case 'ADMIN': router.push('/admin'); break;
            case 'WAREHOUSE_MANAGER': router.push('/company/warehouse'); break;
            case 'DRIVER': router.push('/driver'); break;
            case 'RECIPIENT': router.push('/recipient'); break;
            default: router.push('/company');
        }
    }, [hydrated, isAuthenticated, user, router]);

    if (hydrated && isAuthenticated) {
        return (
            <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--nova-bg, #fff)' }}>
                <Loader size="large" />
            </div>
        );
    }

    const isDark = theme === 'dark';
    const themeLabel = isDark ? 'Светлая тема' : 'Тёмная тема';
    const paid = !!tariff?.paid;
    const price = tariff?.pricePerUser ?? 0;
    const trialDays = tariff?.trialDays ?? 0;
    const setSeatsSafe = (n: number) => setSeats(Math.min(999, Math.max(1, n)));

    return (
        <div className={`lc-nova ${styles.root}`}>
            <a href="#content" className={styles.skip}>Перейти к содержанию</a>

            <header className={styles.head}>
                <div className={styles.headBand}>
                    <Link href="/" className={styles.brand}>LogiCore</Link>

                    <nav className={styles.nav} aria-label="Разделы">
                        {NAV.map((n) => (
                            <a key={n.href} href={n.href} className={styles.navLink}>{n.label}</a>
                        ))}
                    </nav>

                    <div className={styles.headRight}>
                        <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => setTheme(isDark ? 'light' : 'dark')}
                            aria-label={themeLabel}
                            title={themeLabel}
                        >
                            {isDark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
                        </button>
                        <Link href="/login" className={`${styles.btn} ${styles.btnGhost} ${styles.wideOnly}`}>Войти</Link>
                        <Link href="/register" className={`${styles.btn} ${styles.btnPrimary} ${styles.wideOnly}`}>Зарегистрироваться</Link>
                        <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.burger}`}
                            onClick={() => setMenuOpen((v) => !v)}
                            aria-label="Меню"
                            aria-expanded={menuOpen}
                            aria-controls="mobile-menu"
                        >
                            {menuOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
                        </button>
                    </div>
                </div>

                {menuOpen && (
                    <nav id="mobile-menu" aria-label="Меню" className={styles.menu}>
                        {NAV.map((n) => (
                            <a key={n.href} href={n.href} className={styles.menuLink} onClick={() => setMenuOpen(false)}>
                                {n.label}
                            </a>
                        ))}
                        <div className={styles.menuBtns}>
                            <Link href="/login" className={`${styles.menuBtn} ${styles.btnGhost}`}>Войти</Link>
                            <Link href="/register" className={`${styles.menuBtn} ${styles.menuBtnMain} ${styles.btnPrimary}`}>Зарегистрироваться</Link>
                        </div>
                    </nav>
                )}
            </header>

            <main id="content">
                {/* ===== Первый экран: заголовок и сразу продукт ===== */}
                <section className={`${styles.band} ${styles.hero}`}>
                    <h1 className={styles.title}>Заявки, транспорт и&nbsp;расчёты — в&nbsp;одной системе</h1>

                    {/* «Зарегистрироваться» и «Войти» здесь только на телефоне:
                        на компьютере те же кнопки стоят в шапке, на одном экране
                        с этими, и читались как повтор (владелец, 06.11.2026).
                        На телефоне шапка прячет их за меню — без этих кнопок
                        человек с рекламы не увидел бы, куда нажать. */}
                    <div className={styles.heroRow}>
                        <p className={styles.lead}>
                            LogiCore объединяет оформление заявок, назначение перевозчиков, контроль
                            рейсов и взаиморасчёты. Данные вводятся один раз и доступны всем
                            участникам перевозки.
                        </p>
                        <div className={styles.heroBtns}>
                            <Link href="/register" className={`${styles.btnLg} ${styles.btnPrimary}`}>Зарегистрироваться</Link>
                            <Link href="/login" className={`${styles.btnLg} ${styles.btnGhost}`}>Войти</Link>
                        </div>
                        <span className={styles.trust}>Развёртывание за один рабочий день · Данные хранятся в вашем аккаунте</span>
                    </div>

                    <OrdersJournal />
                </section>

                <div className={styles.strip}>
                    <p className={styles.band}>{STRIP}</p>
                </div>

                {/* ===== Как это работает ===== */}
                <section id="как" className={`${styles.band} ${styles.section}`}>
                    <div className={styles.aside}>
                        <div className={styles.eyebrow}>Как это работает</div>
                        <h2 className={styles.h2}>От оформления заявки до закрытия расчётов — четыре шага</h2>
                        <p className={styles.asideText}>
                            Переносить данные вручную не требуется: каждый следующий шаг использует сведения предыдущего.
                        </p>
                    </div>
                    <ol className={`${styles.main} ${styles.steps}`}>
                        {STEPS.map((s, i) => (
                            <li key={s.title} className={styles.step}>
                                <div className={styles.stepText}>
                                    <div className={styles.stepNum}>Шаг {i + 1}</div>
                                    <h3 className={styles.stepTitle}>{s.title}</h3>
                                    <p className={styles.stepDesc}>{s.text}</p>
                                </div>
                                <s.Visual />
                            </li>
                        ))}
                    </ol>
                </section>

                {/* ===== Мониторинг ===== */}
                <section id="рейс" className={styles.deep}>
                    <div className={`${styles.band} ${styles.section}`}>
                        <div className={`${styles.aside} ${styles.deepAside}`}>
                            <div className={styles.eyebrow}>Мониторинг</div>
                            <h2 className={styles.h2}>Положение транспорта видно без звонка водителю</h2>
                            <ul className={styles.deepList}>
                                {MONITORING.map((m) => <li key={m}>{m}</li>)}
                            </ul>
                        </div>
                        <RouteSketch />
                    </div>
                </section>

                {/* ===== Возможности ===== */}
                <section id="возможности" className={`${styles.band} ${styles.sectionBlock}`}>
                    <div className={styles.sectionRow}>
                        <div className={styles.aside}>
                            <div className={styles.eyebrow}>Возможности</div>
                            <h2 className={styles.h2}>Полный цикл работы экспедитора</h2>
                        </div>
                        <div className={`${styles.main} ${styles.features}`}>
                            {FEATURES.map((f) => (
                                <div key={f.title} className={styles.feature}>
                                    <h3>{f.title}</h3>
                                    <p>{f.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <TripDocuments />
                </section>

                {/* ===== Кому подходит ===== */}
                <section id="кому" className={styles.ruledTop}>
                    <div className={`${styles.band} ${styles.section}`}>
                        <div className={styles.aside}>
                            <div className={styles.eyebrow}>Кому подходит</div>
                            <h2 className={styles.h2}>Один рейс — три роли и три набора задач</h2>
                        </div>
                        <div className={`${styles.main} ${styles.roles}`}>
                            {AUDIENCES.map((a) => (
                                <div key={a.title}>
                                    <h3 className={styles.roleTitle}>{a.title}</h3>
                                    <ul className={styles.roleList}>
                                        {a.items.map((item) => <li key={item}>{item}</li>)}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ===== Тариф ===== */}
                <section id="тариф" className={styles.mutedBand}>
                    <div className={`${styles.band} ${styles.section}`}>
                        <div className={styles.aside}>
                            <div className={styles.eyebrow}>Тариф</div>
                            <h2 className={styles.h2}>Один тариф без ограничений по функциям</h2>
                            <p className={styles.asideText}>
                                Все разделы доступны сразу: заявки, документы, взаиморасчёты и мониторинг.
                                Отдельной платы за модули нет.
                            </p>
                        </div>

                        <div className={`${styles.main} ${styles.tariff}`}>
                            <div className={styles.tariffMain}>
                                <span className={styles.badge}>
                                    {paid ? `${trialDays} дней бесплатно` : 'идёт тестирование'}
                                </span>
                                {/* Пока цены нет, крупно стоит слово, а не ноль:
                                    «0 ₸» на витрине читается как «продукт ничего не
                                    стоит», а сказать надо другое — платить пока не за
                                    что, потому что идёт тестирование.
                                    «За сотрудника» — прямо под ценой, а не мелко внизу:
                                    иначе человек посчитает в уме одну сумму, а в счёте
                                    увидит другую. */}
                                <div>
                                    <div className={styles.price}>{paid ? `${money(price)} ₸` : 'Бесплатно'}</div>
                                    <div className={styles.per}>{paid ? 'за сотрудника в месяц' : 'на время тестирования'}</div>
                                </div>

                                {/* Калькулятор: платят за каждого сотрудника, и сумму за
                                    свою команду человек хочет увидеть сразу, а не
                                    умножать в уме (задачи шефа, N3). */}
                                {paid && price > 0 && (
                                    <div className={styles.calc}>
                                        <label htmlFor="seats" className={styles.calcLabel}>Сотрудников</label>
                                        <span className={styles.stepper}>
                                            <button type="button" aria-label="Меньше сотрудников" onClick={() => setSeatsSafe(seats - 1)}>−</button>
                                            <input
                                                id="seats"
                                                inputMode="numeric"
                                                value={seats}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                                    setSeatsSafe(Number.isFinite(n) ? n : 1);
                                                }}
                                            />
                                            <button type="button" aria-label="Больше сотрудников" onClick={() => setSeatsSafe(seats + 1)}>+</button>
                                        </span>
                                        <b className={styles.calcTotal} aria-live="polite">{money(seats * price)}&nbsp;₸ в месяц</b>
                                    </div>
                                )}

                                <Link href="/register" className={`${styles.tariffBtn} ${styles.btnPrimary}`}>
                                    {paid ? `Попробовать ${trialDays} дней` : 'Зарегистрировать компанию'}
                                </Link>
                                <p className={styles.tariffNote}>
                                    {paid
                                        ? 'Оплата картой или по счёту на вашу компанию. Продлевать можно заранее — оплаченные дни не сгорают.'
                                        : 'О переходе на платный тариф предупредим заранее.'}
                                </p>

                                {/* Значки карт у цены, а не в подвале: вопрос «чем
                                    платить» возникает, когда человек смотрит на сумму. */}
                                <div className={styles.payMarks}><PaymentMarks /></div>
                            </div>

                            <div className={styles.tariffList}>
                                <div className={styles.tariffListHead}>Что входит</div>
                                <ul>
                                    {(tariff?.features?.length ? tariff.features : TARIFF_FEATURES).map((f) => (
                                        <li key={f}>{f}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ===== Призыв ===== */}
                <section className={styles.inv}>
                    <div className={`${styles.band} ${styles.cta}`}>
                        <div className={styles.ctaText}>
                            <h2>Начните работу в&nbsp;LogiCore</h2>
                            <p>Зарегистрируйте компанию, оформите первую заявку и оцените расчёт маржи. На настройку уходит один рабочий день.</p>
                        </div>
                        <Link href="/register" className={styles.ctaBtn}>Зарегистрироваться</Link>
                    </div>
                </section>
            </main>

            <footer className={`${styles.band} ${styles.foot}`}>
                <span className={styles.footBrand}>LogiCore</span>
                <span>© {new Date().getFullYear()} LogiCore · Казахстан</span>
                <nav className={styles.footLinks} aria-label="Документы">
                    <Link href="/terms">Условия</Link>
                    <Link href="/privacy">Конфиденциальность</Link>
                    <Link href="/login">Войти</Link>
                </nav>
            </footer>
        </div>
    );
}
