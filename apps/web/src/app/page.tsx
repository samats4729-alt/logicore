'use client';
// Force rebuild frontend 2026-06-04 08:59

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    EnvironmentOutlined
} from '@ant-design/icons';
import InteractiveBackground from '@/components/ui/InteractiveBackground';
import styles from './page.module.css';

export default function HomePage() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (isHydrated && isAuthenticated && user) {
            // Редирект на соответствующий дашборд по роли
            switch (user.role) {
                case 'ADMIN':
                    router.push('/admin');
                    break;
                case 'COMPANY_ADMIN':
                case 'LOGISTICIAN':
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

    if (!isHydrated || isAuthenticated) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#000000'
            }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Navbar */}
            <nav className={styles.navbar}>
                <div className={styles.logo}>
                    <GlobalOutlined style={{ color: '#1677ff' }} />
                    Logi<span>Core</span>
                </div>
                <div>
                    <Button 
                        type="text" 
                        style={{ color: '#fff', marginRight: 16, fontSize: '1rem' }}
                        onClick={() => router.push('/login')}
                    >
                        Войти
                    </Button>
                    <Button 
                        type="primary" 
                        shape="round"
                        size="large"
                        onClick={() => router.push('/register')}
                        style={{ background: 'linear-gradient(135deg, #1677ff 0%, #4096ff 100%)', border: 'none', fontWeight: 600 }}
                    >
                        Регистрация
                    </Button>
                </div>
            </nav>

            {/* Hero Section with Interactive Particles */}
            <InteractiveBackground 
                background="#000000" 
                particleColor="rgba(22, 119, 255, 0.8)" 
                lineColor="rgba(22, 119, 255, "
            >
                <section className={styles.hero} style={{ minHeight: 'auto', width: '100%' }}>
                    <div className={styles.content}>
                        <h1 className={styles.title}>
                            Новое измерение логистики и грузоперевозок
                        </h1>
                        <p className={styles.subtitle}>
                            Единая цифровая экосистема, которая объединяет грузовладельцев, экспедиторов и водителей. Автоматизируйте процессы, отслеживайте грузы в реальном времени и увеличивайте рентабельность вашего бизнеса с помощью передовых технологий LogiCore.
                        </p>
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
                    </div>
                </section>
            </InteractiveBackground>

            {/* Comprehensive Features Section */}
            <section className={styles.featuresSection}>
                <h2 className={styles.sectionTitle}>Технологии для вашего бизнеса</h2>
                <p className={styles.sectionSubtitle}>
                    Мы собрали лучшие инструменты для управления цепями поставок, объединив финансовый учет, мониторинг и документооборот в одном окне.
                </p>
                <div className={styles.featuresGrid}>
                    <div className={styles.featureCard}>
                        <div className={styles.featureIconWrapper}>
                            <EnvironmentOutlined />
                        </div>
                        <h3 className={styles.featureTitle}>Глобальное отслеживание</h3>
                        <p className={styles.featureDesc}>
                            Интерактивная 3D-карта с отображением всех ваших транспортных средств и грузов в реальном времени. Интеграция с GPS и мобильными устройствами водителей для точного позиционирования.
                        </p>
                    </div>
                    <div className={styles.featureCard}>
                        <div className={styles.featureIconWrapper}>
                            <LineChartOutlined />
                        </div>
                        <h3 className={styles.featureTitle}>Глубокая финансовая аналитика</h3>
                        <p className={styles.featureDesc}>
                            Полный контроль над финансами. Автоматический расчет рентабельности рейсов, учет расходов (топливо, платные дороги, обслуживание) и прогнозирование доходов.
                        </p>
                    </div>
                    <div className={styles.featureCard}>
                        <div className={styles.featureIconWrapper}>
                            <SafetyCertificateOutlined />
                        </div>
                        <h3 className={styles.featureTitle}>Безопасный документооборот</h3>
                        <p className={styles.featureDesc}>
                            Генерация договоров, актов и путевых листов в один клик. Электронные подписи и надежное облачное хранение всех важных документов вашей компании.
                        </p>
                    </div>
                </div>
            </section>

            {/* Roles/For Whom Section */}
            <section className={styles.rolesSection}>
                <h2 className={styles.sectionTitle}>Для каждого участника логистической цепи</h2>
                <p className={styles.sectionSubtitle}>
                    LogiCore предоставляет специализированные рабочие места для всех ролей в вашей компании, обеспечивая бесшовное взаимодействие.
                </p>
                <div className={styles.rolesGrid}>
                    {/* Role: Company/Logistics */}
                    <div className={styles.roleCard}>
                        <h3 className={styles.roleTitle}>
                            <ShopOutlined className={styles.roleIcon} /> Транспортные компании
                        </h3>
                        <ul className={styles.roleList}>
                            <li>Управление автопарком и штатом водителей</li>
                            <li>Комплексная аналитика и отчетность</li>
                            <li>Распределение заказов и маршрутизация</li>
                            <li>Полный контроль над финансами</li>
                        </ul>
                    </div>

                    {/* Role: Forwarder */}
                    <div className={styles.roleCard}>
                        <h3 className={styles.roleTitle}>
                            <TeamOutlined className={styles.roleIcon} /> Экспедиторы
                        </h3>
                        <ul className={styles.roleList}>
                            <li>Быстрый поиск свободных машин</li>
                            <li>Ведение базы клиентов и партнеров</li>
                            <li>Мониторинг статуса выполнения заявок</li>
                            <li>Автоматическое формирование счетов</li>
                        </ul>
                    </div>

                    {/* Role: Driver */}
                    <div className={styles.roleCard}>
                        <h3 className={styles.roleTitle}>
                            <CarOutlined className={styles.roleIcon} /> Водители
                        </h3>
                        <ul className={styles.roleList}>
                            <li>Удобное мобильное приложение для работы</li>
                            <li>Детали маршрута и навигация</li>
                            <li>Отчеты по расходам в пути (чеки, фото)</li>
                            <li>Связь с диспетчером 24/7</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerLogo}>
                    <GlobalOutlined style={{ color: '#1677ff', marginRight: '8px' }} />
                    Logi<span>Core</span>
                </div>
                <p className={styles.footerText}>
                    © {new Date().getFullYear()} LogiCore Platform. Все права защищены. Интеллектуальная логистика нового поколения.
                </p>
            </footer>
        </div>
    );
}
