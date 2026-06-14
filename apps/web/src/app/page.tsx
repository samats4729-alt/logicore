'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Spin, Button } from 'antd';
import { useAuthStore } from '@/store/auth';
import { 
    GlobalOutlined, 
    LineChartOutlined, 
    TeamOutlined,
    ArrowRightOutlined,
    SafetyCertificateOutlined,
    CarOutlined,
    ShopOutlined,
    EnvironmentOutlined,
    ThunderboltOutlined,
    CloudOutlined,
    MobileOutlined
} from '@ant-design/icons';

// CSS Module
import styles from './page.module.css';

// Dynamic Import of Three.js Globe (Client-only, no SSR)
const HeroGlobe = dynamic(() => import('@/components/ui/HeroGlobe'), { ssr: false });

// Direct imports of lightweight client components
import Reveal from '@/components/ui/Reveal';

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
            if (window.scrollY > 20) {
                setScrolled(true);
            } else {
                setScrolled(false);
            }
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

    // Features data array
    const features = [
        {
            icon: <EnvironmentOutlined />,
            title: 'Глобальное отслеживание',
            desc: 'Интерактивная 3D-карта с отображением всех ваших транспортных средств и грузов в реальном времени. Интеграция с GPS и мобильными устройствами водителей для точного позиционирования.'
        },
        {
            icon: <LineChartOutlined />,
            title: 'Глубокая финансовая аналитика',
            desc: 'Полный контроль над финансами. Автоматический расчет рентабельности рейсов, учет расходов (топливо, платные дороги, обслуживание) и прогнозирование доходов.'
        },
        {
            icon: <SafetyCertificateOutlined />,
            title: 'Безопасный документооборот',
            desc: 'Генерация договоров, актов и путевых листов в один клик. Электронные подписи и надежное облачное хранение всех важных документов вашей компании.'
        },
        {
            icon: <CloudOutlined />,
            title: 'Облачная инфраструктура',
            desc: 'Бесперебойный доступ к платформе из любой точки мира. Высокая отказоустойчивость, автоматическое масштабирование ресурсов и максимальная безопасность ваших данных.'
        },
        {
            icon: <MobileOutlined />,
            title: 'Мобильное приложение водителя',
            desc: 'Удобный инструмент для получения заказов, построения маршрутов, отправки отчетов по чекам и прямой связи с диспетчером 24/7.'
        },
        {
            icon: <TeamOutlined />,
            title: 'Совместная работа',
            desc: 'Эффективное взаимодействие между логистами, водителями, экспедиторами и клиентами. Мгновенные уведомления, чаты и общий доступ к информации.'
        }
    ];

    // Steps data array
    const steps = [
        {
            num: '01',
            title: 'Создайте заявку',
            desc: 'Укажите параметры груза, точки погрузки/выгрузки и особые требования к транспортировке за несколько кликов.'
        },
        {
            num: '02',
            title: 'Подберите транспорт',
            desc: 'Алгоритмы платформы автоматически предложат подходящие машины из вашего автопарка или базы проверенных партнеров.'
        },
        {
            num: '03',
            title: 'Отслеживайте груз',
            desc: 'Следите за перемещением груза в реальном времени на интерактивной карте с получением статусов на каждом этапе.'
        },
        {
            num: '04',
            title: 'Закройте рейс',
            desc: 'Получите автоматически сформированные закрывающие документы, оцените работу водителя и рассчитайте итоговую прибыль.'
        }
    ];

    // Roles data array
    const roles = [
        {
            icon: <ShopOutlined className={styles.roleIcon} />,
            title: 'Транспортные компании',
            list: [
                'Управление автопарком и штатом водителей',
                'Комплексная аналитика и отчетность',
                'Распределение заказов и маршрутизация',
                'Полный контроль над финансами'
            ]
        },
        {
            icon: <TeamOutlined className={styles.roleIcon} />,
            title: 'Экспедиторы',
            list: [
                'Быстрый поиск свободных машин',
                'Ведение базы клиентов и партнеров',
                'Мониторинг статуса выполнения заявок',
                'Автоматическое формирование счетов'
            ]
        },
        {
            icon: <CarOutlined className={styles.roleIcon} />,
            title: 'Водители',
            list: [
                'Удобное мобильное приложение для работы',
                'Детали маршрута и навигация',
                'Отчеты по расходам в пути (чеки, фото)',
                'Связь с диспетчером 24/7'
            ]
        }
    ];

    return (
        <div className={styles.container}>
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
                <HeroGlobe />
                <div className={styles.heroGlow} />
                <div className={styles.gridOverlay} />
                
                <div className={styles.content}>
                    <Reveal delay={100}>
                        <div className={styles.badge}>
                            <ThunderboltOutlined style={{ marginRight: 6 }} /> 
                            Интеллектуальная логистика нового поколения
                        </div>
                    </Reveal>
                    
                    <Reveal delay={300}>
                        <h1 className={styles.title}>
                            Новое измерение логистики<br />и грузоперевозок
                        </h1>
                    </Reveal>
                    
                    <Reveal delay={500}>
                        <p className={styles.subtitle}>
                            Единая цифровая экосистема, которая объединяет грузовладельцев, экспедиторов и водителей. Автоматизируйте процессы, отслеживайте грузы в реальном времени и увеличивайте рентабельность вашего бизнеса с помощью передовых технологий LogiCore.
                        </p>
                    </Reveal>
                    
                    <Reveal delay={700}>
                        <div className={styles.actions}>
                            <Button 
                                type="primary" 
                                size="large" 
                                className={styles.primaryBtn}
                                onClick={() => router.push('/register')}
                            >
                                Начать работу <ArrowRightOutlined />
                            </Button>
                            <Button 
                                size="large" 
                                className={styles.secondaryBtn}
                                onClick={() => router.push('/login')}
                            >
                                Вход в систему
                            </Button>
                        </div>
                    </Reveal>
                </div>

                <div className={styles.scrollHint}>
                    <span>Листайте вниз</span>
                    <span className={styles.mouse}>
                        <span className={styles.wheel} />
                    </span>
                </div>
            </section>


            {/* Features Section */}
            <section className={styles.featuresSection}>
                <Reveal delay={100}>
                    <h2 className={styles.sectionTitle}>Технологии для вашего бизнеса</h2>
                </Reveal>
                <Reveal delay={200}>
                    <p className={styles.sectionSubtitle}>
                        Мы собрали лучшие инструменты для управления цепями поставок, объединив финансовый учет, мониторинг и документооборот в одном окне.
                    </p>
                </Reveal>
                <div className={styles.featuresGrid}>
                    {features.map((feat, i) => (
                        <Reveal 
                            key={i} 
                            className={styles.featureCard} 
                            delay={(i % 3) * 100}
                        >
                            <div className={styles.featureIconWrapper}>
                                {feat.icon}
                            </div>
                            <h3 className={styles.featureTitle}>{feat.title}</h3>
                            <p className={styles.featureDesc}>{feat.desc}</p>
                        </Reveal>
                    ))}
                </div>
            </section>

            {/* How It Works Section */}
            <section className={styles.howSection}>
                <Reveal delay={100}>
                    <h2 className={styles.sectionTitle}>Как это работает</h2>
                </Reveal>
                <Reveal delay={200}>
                    <p className={styles.sectionSubtitle}>
                        Простые шаги для полной автоматизации и тотального контроля ваших логистических процессов
                    </p>
                </Reveal>
                <div className={styles.stepsGrid}>
                    {steps.map((step, i) => (
                        <Reveal 
                            key={i} 
                            className={styles.stepCard} 
                            delay={i * 100}
                        >
                            <div className={styles.stepNumber}>{step.num}</div>
                            <h3 className={styles.stepTitle}>{step.title}</h3>
                            <p className={styles.stepDesc}>{step.desc}</p>
                        </Reveal>
                    ))}
                </div>
            </section>

            {/* Roles Section */}
            <section className={styles.rolesSection}>
                <Reveal delay={100}>
                    <h2 className={styles.sectionTitle}>Для каждого участника логистической цепи</h2>
                </Reveal>
                <Reveal delay={200}>
                    <p className={styles.sectionSubtitle}>
                        LogiCore предоставляет специализированные рабочие места для всех ролей в вашей компании, обеспечивая бесшовное взаимодействие.
                    </p>
                </Reveal>
                <div className={styles.rolesGrid}>
                    {roles.map((role, i) => (
                        <Reveal 
                            key={i} 
                            className={styles.roleCard} 
                            delay={i * 100}
                        >
                            <h3 className={styles.roleTitle}>
                                {role.icon} {role.title}
                            </h3>
                            <ul className={styles.roleList}>
                                {role.list.map((item, j) => (
                                    <li key={j}>{item}</li>
                                ))}
                            </ul>
                        </Reveal>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section className={styles.ctaSection}>
                <div className={styles.ctaGlow} />
                <Reveal className={styles.ctaInner} delay={100}>
                    <h2 className={styles.ctaTitle}>Готовы вывести логистику на новый уровень?</h2>
                    <p className={styles.ctaSubtitle}>
                        Присоединяйтесь к тысячам компаний, которые уже масштабируют свой бизнес, экономят на издержках и доставляют грузы точно в срок с помощью LogiCore.
                    </p>
                    <Button 
                        type="primary" 
                        size="large" 
                        className={styles.primaryBtn}
                        onClick={() => router.push('/register')}
                    >
                        Создать аккаунт <ArrowRightOutlined />
                    </Button>
                </Reveal>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerLogo}>
                    <GlobalOutlined style={{ color: '#1677ff' }} />
                    Logi<span>Core</span>
                </div>
                <p className={styles.footerText}>
                    © {new Date().getFullYear()} LogiCore Platform. Все права защищены. Интеллектуальная логистика нового поколения.
                </p>
            </footer>
        </div>
    );
}
