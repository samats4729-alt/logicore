'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
    ArrowRight,
    Banknote,
    Building2,
    Check,
    FileText,
    MapPin,
    Moon,
    Sparkles,
    Sun,
    Truck,
    Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useTheme } from '@/components/ThemeProvider';
import AssemblyStage from '@/components/landing/AssemblyStage';
import PaymentMarks from '@/components/public/PaymentMarks';
import styles from './landing.module.css';
import Loader from '@/components/ui/Loader';

/**
 * Главная страница.
 *
 * Собрана на том же языке, что кабинет (`design/finance-hub`): те же
 * токены, та же шапка высотой 58, те же карточки. Вход в систему не должен
 * ощущаться как переход на другой сайт.
 *
 * Первый экран показывает продукт, а не рассказывает о нём: детали журнала
 * заявок лежат врассыпную и собираются в рабочий экран по мере прокрутки.
 */

// Карта весит больше всей остальной страницы, поэтому не входит в первую
// загрузку — подтягивается, когда до раздела долистали.
const RouteMap = dynamic(() => import('@/components/landing/RouteMap'), {
    ssr: false,
    loading: () => <div style={{ aspectRatio: '16 / 7', minHeight: 240 }} />,
});

const STEPS = [
    { num: '01', title: 'Оформление заявки', text: 'Груз, маршрут и ставки заполняются в одной форме. Реквизиты контрагента подтягиваются по БИН.' },
    { num: '02', title: 'Назначение перевозчика', text: 'Штатный водитель, партнёр-перевозчик или публикация рейса на бирже грузов.' },
    { num: '03', title: 'Контроль рейса', text: 'Статусы и координаты транспорта обновляются в реальном времени и видны обеим сторонам.' },
    { num: '04', title: 'Закрытие расчётов', text: 'Счета, акты и доверенности формируются автоматически, маржа считается по каждому рейсу.' },
];

const FEATURES = [
    { icon: Truck, title: 'Заявки и биржа грузов', text: 'Оформление заявки, назначение перевозчика и публикация рейса на бирже.' },
    { icon: MapPin, title: 'GPS-мониторинг', text: 'Положение транспорта на карте и статусы рейса от погрузки до выгрузки.' },
    { icon: Banknote, title: 'Финансы и взаиморасчёты', text: 'Реестр рейсов, движение денежных средств, прибыль и задолженность по каждому контрагенту.' },
    { icon: FileText, title: 'Документооборот', text: 'Счета, акты выполненных работ и доверенности формируются автоматически.' },
    { icon: Building2, title: 'Несколько юридических лиц', text: 'Все организации в одном аккаунте, общий список дел с фильтром по организации.' },
    { icon: Sparkles, title: 'Встроенный помощник', text: 'Отвечает на вопросы по работе с системой и подсказывает следующий шаг.' },
];

const AUDIENCES = [
    {
        icon: Users, title: 'Экспедиторским компаниям', items: [
            'Заявки, перевозчики и биржа в одном рабочем окне',
            'Маржа рассчитывается по каждому рейсу',
            'Взаиморасчёты и счета без внешних таблиц',
            'Несколько юридических лиц в одном аккаунте',
        ],
    },
    {
        icon: Building2, title: 'Грузовладельцам', items: [
            'Актуальный статус каждой перевозки',
            'Подтверждение факта выполнения рейса',
            'История перевозок и документы по каждому заказу',
            'Отдельный кабинет с необходимым минимумом функций',
        ],
    },
    {
        icon: Truck, title: 'Перевозчикам', items: [
            'Заявки от экспедиторов или заказчиков',
            'Назначение своих водителей и транспорта',
            'Подтверждение выполнения рейса',
            'Акты и взаиморасчёты по каждому рейсу',
        ],
    },
];

/** Что входит в тариф, пока владелец не завёл свой список в админке. */
const TARIFF_FEATURES = [
    'Заявки, документы и печатные формы',
    'Счета, акты и взаиморасчёты',
    'Мониторинг транспорта на карте',
    'Сотрудники и организации без ограничения по числу',
];

interface Tariff {
    paid: boolean;
    priceMonthly: number;
    trialDays: number;
    features: string[];
}

export default function HomePage() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();
    const { theme, setTheme } = useTheme();
    const [hydrated, setHydrated] = useState(false);
    const [tariff, setTariff] = useState<Tariff | null>(null);

    useEffect(() => {
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

    if (!hydrated || isAuthenticated) {
        return (
            <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--nova-bg, #fff)' }}>
                <Loader size="large" />
            </div>
        );
    }

    return (
        <div className={`lc-nova ${styles.root}`}>
            <header className={styles.head}>
                <div className={styles.headBand}>
                    <a href="/" className={styles.brand}>Logi<span>Core</span></a>

                    <nav className={styles.links}>
                        <a className={styles.link} href="#как">Как это работает</a>
                        <a className={styles.link} href="#возможности">Возможности</a>
                        <a className={styles.link} href="#рейс">Мониторинг</a>
                        <a className={styles.link} href="#кому">Кому подходит</a>
                        <a className={styles.link} href="#тариф">Тариф</a>
                    </nav>

                    <div className={styles.headRight}>
                        <button
                            type="button"
                            className={styles.themeBtn}
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                        >
                            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>
                        <button type="button" className={styles.ghost} onClick={() => router.push('/login')}>
                            Войти
                        </button>
                        <button type="button" className={styles.primary} onClick={() => router.push('/register')}>
                            Зарегистрироваться <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </header>

            {/* ===== Первый экран =====
                Заголовок живёт внутри сцены, а не отдельным блоком над ней:
                иначе разлетевшиеся детали начинаются под ним, за краем
                экрана, и сборку просто не видно. */}
            <AssemblyStage>
                <div className={styles.hero}>
                    <h1 className={styles.title}>
                        Заявки, транспорт и расчёты — <em>в одной системе</em>
                    </h1>
                    <p className={styles.lead}>
                        LogiCore объединяет оформление заявок, назначение перевозчиков, контроль
                        рейсов и взаиморасчёты. Данные вводятся один раз и доступны всем
                        участникам перевозки.
                    </p>
                    <div className={styles.heroBtns}>
                        <button type="button" className={styles.primary} onClick={() => router.push('/register')}>
                            Зарегистрироваться <ArrowRight size={14} />
                        </button>
                        <button type="button" className={styles.ghost} onClick={() => router.push('/login')}>
                            Войти
                        </button>
                    </div>
                    <div className={styles.trust}>Развёртывание за один рабочий день · Данные хранятся в вашем аккаунте</div>
                </div>
            </AssemblyStage>

            {/* ===== Как работает ===== */}
            <section className={styles.section} id="как">
                <div className={styles.band}>
                    <div className={styles.sectionHead}>
                        <div className={styles.eyebrow}>Как это работает</div>
                        <h2 className={styles.sectionTitle}>От оформления заявки до закрытия расчётов — четыре шага</h2>
                        <p className={styles.sectionLead}>
                            Переносить данные вручную не требуется: каждый следующий шаг использует сведения предыдущего.
                        </p>
                    </div>
                    <div className={styles.steps}>
                        {STEPS.map((s) => (
                            <div key={s.num} className={styles.step}>
                                <div className={styles.stepNum}>{s.num}</div>
                                <div className={styles.stepTitle}>{s.title}</div>
                                <div className={styles.stepText}>{s.text}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== Живой рейс ===== */}
            <section className={`${styles.section} ${styles.sectionMuted}`} id="рейс">
                <div className={styles.band}>
                    <div className={styles.mapRow}>
                        <div className={styles.mapText}>
                            <div className={styles.eyebrow}>Мониторинг</div>
                            <h2 className={styles.sectionTitle}>Положение транспорта видно без звонка водителю</h2>
                            <ul>
                                <li><Check size={14} className={styles.tick} /> Координаты транспорта и пройденная часть маршрута</li>
                                <li><Check size={14} className={styles.tick} /> Статусы от погрузки до выгрузки — синхронно у всех участников</li>
                                <li><Check size={14} className={styles.tick} /> Заказчик видит те же данные, что и логист</li>
                            </ul>
                        </div>
                        <RouteMap theme={theme} />
                    </div>
                </div>
            </section>

            {/* ===== Возможности ===== */}
            <section className={styles.section} id="возможности">
                <div className={styles.band}>
                    <div className={styles.sectionHead}>
                        <div className={styles.eyebrow}>Возможности</div>
                        <h2 className={styles.sectionTitle}>Полный цикл работы экспедитора</h2>
                    </div>
                    <div className={styles.features}>
                        {FEATURES.map((f) => (
                            <div key={f.title} className={styles.card}>
                                <div className={styles.cardIcon}><f.icon size={16} /></div>
                                <div className={styles.cardTitle}>{f.title}</div>
                                <div className={styles.cardText}>{f.text}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== Кому подходит ===== */}
            <section className={`${styles.section} ${styles.sectionMuted}`} id="кому">
                <div className={styles.band}>
                    <div className={styles.sectionHead}>
                        <div className={styles.eyebrow}>Кому подходит</div>
                        <h2 className={styles.sectionTitle}>Один рейс — три роли и три набора задач</h2>
                    </div>
                    <div className={styles.roles}>
                        {AUDIENCES.map((a) => (
                            <div key={a.title} className={styles.role}>
                                <div className={styles.roleHead}><a.icon size={15} /><b>{a.title}</b></div>
                                <ul className={styles.roleList}>
                                    {a.items.map((item) => (
                                        <li key={item}><Check size={13} className={styles.tick} />{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== Тариф ===== */}
            <section className={styles.section} id="тариф">
                <div className={styles.band}>
                    <div className={`${styles.sectionHead} ${styles.tariffHead}`}>
                        <div className={styles.eyebrow}>Тариф</div>
                        <h2 className={styles.sectionTitle}>Один тариф без ограничений по функциям</h2>
                        <p className={styles.sectionLead}>
                            Все разделы доступны сразу: заявки, документы, взаиморасчёты и мониторинг.
                            Отдельной платы за модули нет.
                        </p>
                    </div>

                    <div className={styles.tariff}>
                        <span className={styles.tariffBadge}>
                            {tariff?.paid ? `${tariff.trialDays} дней бесплатно` : 'идёт тестирование'}
                        </span>
                        {/* Пока цены нет, крупно стоит слово, а не ноль:
                            «0 ₸» на витрине читается как «продукт ничего не
                            стоит», а сказать надо другое — платить пока не за
                            что, потому что идёт тестирование. */}
                        <div className={styles.tariffPrice}>
                            {tariff?.paid ? `${tariff.priceMonthly.toLocaleString('ru-RU')} ₸` : 'Бесплатно'}
                        </div>
                        <div className={styles.tariffPer}>
                            {tariff?.paid ? 'в месяц за компанию' : 'на время тестирования'}
                        </div>

                        <ul className={styles.tariffList}>
                            {(tariff?.features?.length ? tariff.features : TARIFF_FEATURES).map((f) => (
                                <li key={f}><Check size={14} className={styles.tick} />{f}</li>
                            ))}
                        </ul>

                        <button type="button" className={styles.tariffBtn} onClick={() => router.push('/register')}>
                            {tariff?.paid ? `Попробовать ${tariff.trialDays} дней` : 'Зарегистрировать компанию'}
                        </button>

                        <div className={styles.tariffNote}>
                            {tariff?.paid
                                ? 'Оплата по счёту на вашу компанию. Продлевать можно заранее — оплаченные дни не сгорают.'
                                : 'О переходе на платный тариф предупредим заранее.'}
                        </div>

                        {/* Значки карт стоят у цены, а не в подвале: вопрос
                            «чем платить» возникает в ту секунду, когда человек
                            смотрит на сумму, а не когда домотал до конца
                            страницы. */}
                        <PaymentMarks />
                    </div>
                </div>
            </section>

            {/* ===== Призыв ===== */}
            <section className={styles.section}>
                <div className={styles.band}>
                    <div className={styles.cta}>
                        <h2>Начните работу в LogiCore</h2>
                        <p>Зарегистрируйте компанию, оформите первую заявку и оцените расчёт маржи. На настройку уходит один рабочий день.</p>
                        <button type="button" className={styles.ctaBtn} onClick={() => router.push('/register')}>
                            Зарегистрироваться <ArrowRight size={15} />
                        </button>
                    </div>

                    <div className={styles.foot}>
                        <div>© {new Date().getFullYear()} LogiCore · Казахстан</div>
                        <div className={styles.footLinks}>
                            <a href="/terms">Условия</a>
                            <a href="/privacy">Конфиденциальность</a>
                            <a href="/login">Войти</a>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
