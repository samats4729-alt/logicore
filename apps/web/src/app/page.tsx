'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Spin, Button } from 'antd';
import { useAuthStore } from '@/store/auth';
import {
    GlobalOutlined,
    TeamOutlined,
    ArrowRightOutlined,
    CarOutlined,
    ShopOutlined,
} from '@ant-design/icons';

// CSS Module
import styles from './page.module.css';

// Dynamic Import of animated network background (Client-only, no SSR)
const HeroNetwork = dynamic(() => import('@/components/ui/HeroNetwork'), { ssr: false });

// Direct imports of lightweight client components
import Reveal from '@/components/ui/Reveal';
import CustomCursor from '@/components/ui/CustomCursor';
import InteractiveCard from '@/components/ui/InteractiveCard';

// Magnetic wrapper — element drifts toward the cursor on hover
function Magnetic({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLSpanElement>(null);
    const onMove = (e: React.MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
    };
    const reset = () => {
        if (ref.current) ref.current.style.transform = 'translate(0, 0)';
    };
    return (
        <span
            ref={ref}
            onMouseMove={onMove}
            onMouseLeave={reset}
            style={{ display: 'inline-block', transition: 'transform 0.2s ease' }}
        >
            {children}
        </span>
    );
}

export default function HomePage() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();
    const [isHydrated, setIsHydrated] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    // Hydration check
    useEffect(() => {
        setIsHydrated(true);
    }, []);

    // Scroll listener for sticky navbar blur background
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Role-based auth redirect
    useEffect(() => {
        if (isHydrated && isAuthenticated && user) {
            switch (user.role) {
                case 'ADMIN':
                    router.push('/admin');
                    break;
                case 'COMPANY_ADMIN':
                case 'LOGISTICIAN':
                case 'FORWARDER':
                case 'ACCOUNTANT':
                case 'PARTNER':
                    router.push('/company');
                    break;
                case 'WAREHOUSE_MANAGER':
                    router.push('/company/warehouse');
                    break;
                case 'DRIVER':
                    router.push('/driver');
                    break;
                case 'RECIPIENT':
                    router.push('/recipient');
                    break;
                default:
                    router.push('/company');
            }
        }
    }, [isHydrated, isAuthenticated, user, router]);

    // Show loading spinner during hydration or routing redirect
    if (!isHydrated || isAuthenticated) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#030712'
            }}>
                <Spin size="large" />
            </div>
        );
    }

    const features = [
        {
            title: 'Заявки и биржа',
            desc: 'Создавайте заявки за минуту, назначайте перевозчиков или публикуйте рейс на бирже грузов.'
        },
        {
            title: 'GPS-мониторинг',
            desc: 'Живое положение транспорта на карте и статусы рейса — от погрузки до выгрузки.'
        },
        {
            title: 'Финансы и взаиморасчёты',
            desc: 'Реестр рейсов, ДДС, P&L и прозрачные взаиморасчёты с каждым контрагентом.'
        },
        {
            title: 'Документы в один клик',
            desc: 'Договоры, счета и доверенности генерируются автоматически — счётом можно поделиться ссылкой.'
        },
        {
            title: 'Мультикомпании',
            desc: 'Несколько организаций в одном аккаунте с переключением в один клик.'
        },
        {
            title: 'ИИ-гид внутри',
            desc: 'Встроенный ассистент отвечает на вопросы и ведёт по интерфейсу по шагам.'
        },
    ];

    const steps = [
        {
            num: '01',
            title: 'Создайте заявку',
            desc: 'Груз, маршрут, ставки — всё в одной форме. Контрагент подтягивается по БИН.'
        },
        {
            num: '02',
            title: 'Назначьте перевозчика',
            desc: 'Свой водитель, партнёр или биржа грузов — выбирайте, как удобнее.'
        },
        {
            num: '03',
            title: 'Отслеживайте рейс',
            desc: 'Статусы и GPS в реальном времени. Обе стороны видят одно и то же.'
        },
        {
            num: '04',
            title: 'Закройте финансы',
            desc: 'Оплаты, счета и маржа считаются сами. Документы — в один клик.'
        }
    ];

    const roles = [
        {
            icon: <TeamOutlined className={styles.roleIcon} />,
            title: 'Экспедиторы',
            list: [
                'Заявки, перевозчики и биржа в одном окне',
                'Маржа по каждому рейсу автоматически',
                'Взаиморасчёты и счета без Excel',
                'Мультикомпании в одном аккаунте'
            ]
        },
        {
            icon: <ShopOutlined className={styles.roleIcon} />,
            title: 'Заказчики',
            list: [
                'Прозрачный статус каждой перевозки',
                'Подтверждение завершения рейса',
                'История и документы по всем заказам',
                'Свой кабинет без лишних функций'
            ]
        },
        {
            icon: <CarOutlined className={styles.roleIcon} />,
            title: 'Водители',
            list: [
                'Мобильное приложение с маршрутом',
                'Статусы рейса в пару касаний',
                'Детали погрузки и выгрузки под рукой',
                'Связь с диспетчером 24/7'
            ]
        }
    ];

    const splitChars = (text: string, lineIndex: number, accent = false) =>
        Array.from(text).map((ch, i) => (
            <span
                key={i}
                className={`${styles.kineticChar}${accent ? ' ' + styles.kineticAccent : ''}`}
                style={{ animationDelay: `${0.15 + lineIndex * 0.32 + i * 0.04}s` }}
            >
                {ch === ' ' ? ' ' : ch}
            </span>
        ));

    return (
        <div className={styles.container}>
            <CustomCursor />
            {/* Header / Navbar */}
            <nav className={`${styles.navbar} ${scrolled ? styles.navbarScrolled : ''}`}>
                <div className={styles.logo} onClick={() => router.push('/')}>
                    <GlobalOutlined style={{ color: '#1677ff' }} />
                    Logi<span>Core</span>
                </div>
                <div className={styles.navActions}>
                    <Button
                        type="text"
                        className={styles.navLogin}
                        onClick={() => router.push('/login')}
                    >
                        Войти
                    </Button>
                    <Button
                        type="primary"
                        shape="round"
                        size="large"
                        className={styles.primaryBtn}
                        onClick={() => router.push('/register')}
                    >
                        Регистрация
                    </Button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className={styles.hero}>
                <HeroNetwork />
                <div className={styles.heroGlow} />
                <div className={styles.gridOverlay} />

                <div className={styles.heroInner}>
                    <div className={styles.heroIndex}>(01 — Цифровая логистика)</div>

                    <h1 className={styles.kineticTitle}>
                        <span className={styles.kineticLine}>{splitChars('Логистика', 0)}</span>
                        <span className={styles.kineticLine}>{splitChars('в движении', 1, true)}</span>
                    </h1>

                    <p className={styles.heroLead}>
                        Единая цифровая платформа для грузовладельцев, экспедиторов и водителей. Заявки, трекинг в реальном времени и финансы — в одном движении, без трения.
                    </p>

                    <div className={styles.heroActions}>
                        <Magnetic>
                            <Button
                                type="primary"
                                size="large"
                                className={styles.primaryBtn}
                                onClick={() => router.push('/register')}
                            >
                                Начать работу <ArrowRightOutlined />
                            </Button>
                        </Magnetic>
                        <Button
                            size="large"
                            className={styles.secondaryBtn}
                            onClick={() => router.push('/login')}
                        >
                            Вход в систему
                        </Button>
                    </div>

                    <div className={styles.heroBottom}>
                        <span className={styles.heroScrollLabel}>Прокрутите ↓</span>
                    </div>
                </div>
            </section>

            {/* Marquee */}
            <div className={styles.marquee} aria-hidden="true">
                <div className={styles.marqueeTrack}>
                    <span>Заявки</span><b>·</b><span>Трекинг</span><b>·</b><span>Финансы</span><b>·</b><span>Документы</span><b>·</b><span>Автопарк</span><b>·</b><span>Взаиморасчёты</span><b>·</b>
                    <span>Заявки</span><b>·</b><span>Трекинг</span><b>·</b><span>Финансы</span><b>·</b><span>Документы</span><b>·</b><span>Автопарк</span><b>·</b><span>Взаиморасчёты</span><b>·</b>
                </div>
            </div>

            {/* (02) Features — editorial rows */}
            <section className={styles.sectionShell}>
                <Reveal delay={50}>
                    <div className={styles.sectionIndex}>(02 — Возможности)</div>
                </Reveal>
                <Reveal delay={150}>
                    <h2 className={styles.sectionHeading}>
                        Всё для перевозок.<br /><span>В одном окне.</span>
                    </h2>
                </Reveal>
                <div className={styles.featureRows}>
                    {features.map((f, i) => (
                        <Reveal key={i} delay={i * 60}>
                            <div className={styles.featureRow} onClick={() => router.push('/register')}>
                                <span className={styles.frNum}>{String(i + 1).padStart(2, '0')}</span>
                                <div className={styles.frMain}>
                                    <h3 className={styles.frTitle}>{f.title}</h3>
                                    <p className={styles.frDesc}>{f.desc}</p>
                                </div>
                                <ArrowRightOutlined className={styles.frArrow} />
                            </div>
                        </Reveal>
                    ))}
                </div>
            </section>

            {/* (03) Process */}
            <section className={styles.sectionShellAlt}>
                <Reveal delay={50}>
                    <div className={styles.sectionIndex}>(03 — Процесс)</div>
                </Reveal>
                <Reveal delay={150}>
                    <h2 className={styles.sectionHeading}>
                        От заявки<br /><span>до оплаты.</span>
                    </h2>
                </Reveal>
                <div className={styles.stepsFlow}>
                    {steps.map((step, i) => (
                        <Reveal key={i} delay={i * 100}>
                            <InteractiveCard className={styles.stepItem}>
                                <span className={styles.stepGhost}>{step.num}</span>
                                <h3 className={styles.stepName}>{step.title}</h3>
                                <p className={styles.stepText}>{step.desc}</p>
                            </InteractiveCard>
                        </Reveal>
                    ))}
                </div>
            </section>

            {/* (04) Roles */}
            <section className={styles.sectionShell}>
                <Reveal delay={50}>
                    <div className={styles.sectionIndex}>(04 — Для кого)</div>
                </Reveal>
                <Reveal delay={150}>
                    <h2 className={styles.sectionHeading}>
                        Каждому —<br /><span>своё рабочее место.</span>
                    </h2>
                </Reveal>
                <div className={styles.rolesGrid}>
                    {roles.map((role, i) => (
                        <Reveal key={i} delay={i * 100}>
                            <InteractiveCard className={styles.roleCard}>
                                <h3 className={styles.roleTitle}>
                                    {role.icon} {role.title}
                                </h3>
                                <ul className={styles.roleList}>
                                    {role.list.map((item, j) => (
                                        <li key={j}>{item}</li>
                                    ))}
                                </ul>
                            </InteractiveCard>
                        </Reveal>
                    ))}
                </div>
            </section>

            {/* (05) CTA */}
            <section className={styles.ctaBig}>
                <div className={styles.ctaGlow} />
                <Reveal delay={50}>
                    <div className={styles.sectionIndex}>(05 — Старт)</div>
                </Reveal>
                <Reveal delay={150}>
                    <h2 className={styles.ctaHuge}>
                        Готовы<br /><span>двигаться?</span>
                    </h2>
                </Reveal>
                <Reveal delay={250}>
                    <p className={styles.ctaLead}>
                        Регистрация занимает две минуты. Создайте первую заявку сегодня — и почувствуйте разницу.
                    </p>
                </Reveal>
                <Reveal delay={350}>
                    <div>
                        <Magnetic>
                            <Button
                                type="primary"
                                size="large"
                                className={styles.primaryBtn}
                                onClick={() => router.push('/register')}
                            >
                                Создать аккаунт <ArrowRightOutlined />
                            </Button>
                        </Magnetic>
                    </div>
                </Reveal>
            </section>

            {/* Footer */}
            <footer className={styles.footerBig}>
                <div className={styles.footerWordmark} aria-hidden="true">LOGICORE</div>
                <div className={styles.footerRow}>
                    <span>© {new Date().getFullYear()} LogiCore Platform — интеллектуальная логистика</span>
                    <span className={styles.footerLinks}>
                        <span onClick={() => router.push('/login')}>Войти</span>
                        <span className={styles.footerDot}>/</span>
                        <span onClick={() => router.push('/register')}>Регистрация</span>
                        <span className={styles.footerDot}>/</span>
                        <span onClick={() => router.push('/privacy')}>Конфиденциальность</span>
                        <span className={styles.footerDot}>/</span>
                        <span onClick={() => router.push('/terms')}>Оферта</span>
                    </span>
                </div>
            </footer>
        </div>
    );
}
