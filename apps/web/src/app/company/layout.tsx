'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Button, Avatar, Dropdown, Typography, Drawer } from 'antd';
import {
    DashboardOutlined,
    FileTextOutlined,
    TeamOutlined,
    EnvironmentOutlined,
    LogoutOutlined,
    UserOutlined,
    InboxOutlined,
    PushpinOutlined,
    MenuOutlined,
    FileOutlined,
    SettingOutlined,
    DollarOutlined,
    CarOutlined,
    ApartmentOutlined,
    CompassOutlined,
    HomeOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FileExcelOutlined,
    RiseOutlined,
    FileProtectOutlined,
    CalculatorOutlined,
    BarChartOutlined,
    NotificationOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import dynamic from 'next/dynamic';
import { Moon, Sun } from 'lucide-react';
import { api } from '@/lib/api';
import { shortenCompanyName } from '@/lib/company-helper';
import NotificationBell from '@/components/ui/NotificationBell';
import { useTheme } from '@/components/ThemeProvider';
import AiButton from '@/components/ui/AiButton';
import { LiveEventTicker } from '@/components/ui/LiveTicker';
import GlobalSearch from '@/components/ui/GlobalSearch';
import UserAvatar from '@/components/UserAvatar';
import PaywallScreen from '@/components/PaywallScreen';
import NoSectionAccess from '@/components/ui/NoSectionAccess';
import { checkSectionAccess } from '@/lib/section-access';
import { BetaClosed, BetaStrip } from '@/components/ui/BetaNotice';
import { BETA_LABEL, betaStateOf, getBetaSection } from '@/lib/beta-sections';
import Loader from '@/components/ui/Loader';
import { isNavItemActive } from '@/lib/cabinet-nav';
import { ROLE_LABELS } from '@/lib/vocabulary';

const { Header, Content } = Layout;
const { Text } = Typography;

/**
 * Название пункта меню с подписью «бета-тестирование».
 *
 * Подпись стоит рядом с названием, а не всплывает при наведении: на
 * телефоне наведения нет вовсе, а решение «идти сюда или нет» человек
 * принимает до нажатия.
 */
function MenuLabel({ label, href }: { label: string; href: string }) {
    const state = betaStateOf(href);
    if (!state) return <>{label}</>;
    return (
        <span>
            {label}
            <span className="lc-beta-tag">{BETA_LABEL}</span>
        </span>
    );
}

const AssistantWidget = dynamic(() => import('@/components/ui/AssistantWidget'), { ssr: false });

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout, checkAuth, isLoading } = useAuthStore();

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const [hasNewUpdates, setHasNewUpdates] = useState(false);
    const [billingStatus, setBillingStatus] = useState<any>(null);
    const [auditEnabled, setAuditEnabled] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        const fetchPublishedUpdates = async () => {
            try {
                const res = await api.get('/assistant/updates/published');
                const publishedList = res.data || [];
                if (publishedList.length > 0) {
                    const latest = publishedList[0];
                    const stored = localStorage.getItem('lc_last_read_update_id');
                    if (stored !== latest.id) {
                        setHasNewUpdates(true);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch published updates', err);
            }
        };
        fetchPublishedUpdates();

        // Listen for user marking updates as read to clear top badge
        const handleUpdatesRead = () => {
            setHasNewUpdates(false);
        };
        window.addEventListener('logicore:updates-read', handleUpdatesRead);
        return () => window.removeEventListener('logicore:updates-read', handleUpdatesRead);
    }, []);

    // Определяем мобильное устройство
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // ИИ-гид просит открыть мобильное меню (шаг тура ссылается на пункт в Drawer)
    useEffect(() => {
        const openMenu = () => setMobileMenuOpen(true);
        window.addEventListener('logicore:open-mobile-menu', openMenu);
        return () => window.removeEventListener('logicore:open-mobile-menu', openMenu);
    }, []);

    // Статус подписки компании (пока биллинг выключен — ответ {enabled: false})
    useEffect(() => {
        if (!user?.companyId) return;
        api.get('/billing/status')
            .then((res) => setBillingStatus(res.data))
            .catch(() => setBillingStatus(null));
        api.get('/audit/status')
            .then((res) => setAuditEnabled(!!res.data.companiesEnabled))
            .catch(() => setAuditEnabled(false));
    }, [user?.companyId]);

    // Дожидаемся гидратации хранилища Zustand из localStorage
    useEffect(() => {
        setHydrated(useAuthStore.persist.hasHydrated());
        const unsub = useAuthStore.persist.onFinishHydration(() => {
            setHydrated(true);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!hydrated) return;

        checkAuth().then(() => {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser) {
                router.replace('/login');
            } else if (!['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER', 'FORWARDER', 'ACCOUNTANT', 'PARTNER'].includes(currentUser.role)) {
                if (currentUser.role === 'ADMIN') {
                    router.replace('/admin');
                } else {
                    logout();
                    router.replace('/login');
                }
            } else if (!currentUser.companyId && pathname !== '/company/onboarding') {
                // Пока организации нет, разделы кабинета всё равно отвечают
                // отказом — экраны показывали бы пустоту и ошибки. Раньше сюда
                // приводила только регистрация: вышел, зашёл снова — и попасть
                // на подключение организации было уже нечем.
                router.replace('/company/onboarding');
            }
        });
    }, [hydrated, checkAuth, router, logout, pathname]);

    if (!hydrated || isLoading || !user) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader size="large" />
            </div>
        );
    }

    const handleLogout = () => {
        logout();
        router.replace('/login');
    };

    const handleMenuClick = (key: string) => {
        if (key.startsWith('/')) {
            router.push(key);
            setMobileMenuOpen(false);
        }
    };

    // Меню в зависимости от роли
    const getMenuItems = () => {
        const hasPerm = (perm: string) => ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role) || user.permissions?.includes(perm);

        const items: any[] = [
            {
                key: '/company',
                icon: <DashboardOutlined />,
                label: 'Дашборд',
            },
        ];

        // --- ЗАЯВКИ (standalone по референсу) ---
        if (hasPerm('orders')) {
            items.push({
                key: '/company/orders',
                icon: <FileTextOutlined />,
                label: 'Заявки',
            });
        }

        // --- ЗАПРОСЫ (этап до заявки: клиент спросил цену) ---
        // Сразу после «Заявок»: это предыдущий шаг той же работы, и в
        // повседневном порядке он идёт перед ней, а не в стороне.
        if (hasPerm('orders')) {
            items.push({
                key: '/company/requests',
                icon: <CalculatorOutlined />,
                label: 'Запросы',
            });
        }

        // --- МОНИТОРИНГ ---
        // «Склад» переименован в «Очередь на погрузку»: учёта товара здесь
        // нет и не будет, а прежнее название его обещало.
        const monitoringChildren: any[] = [];
        if (hasPerm('tracking')) {
            monitoringChildren.push({
                key: '/company/tracking',
                icon: <EnvironmentOutlined />,
                label: 'Карта и GPS',
            });
        }
        if (user.role === 'WAREHOUSE_MANAGER' || ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            monitoringChildren.push({
                key: '/company/warehouse',
                icon: <HomeOutlined />,
                label: <MenuLabel label="Очередь на погрузку" href="/company/warehouse" />,
            });
        }
        if (monitoringChildren.length > 0) {
            items.push({
                key: 'monitoring_group',
                popupClassName: 'lc-nav-pop',
                icon: <CompassOutlined />,
                label: 'Мониторинг',
                children: monitoringChildren,
            });
        }

        // --- ДЕНЬГИ (ежедневная работа: документы, платежи, долги) ---
        // Прежние «Финансы» держали на одном экране 38 ссылок: ежедневное
        // вперемешку с отчётами и справочниками, которые заводят один раз.
        // Адрес остался прежним — старые ссылки и закладки работают.
        items.push({
            key: '/company/finance',
            icon: <DollarOutlined />,
            label: 'Деньги',
        });

        // --- ОТЧЁТЫ (то, что смотрят раз в месяц) ---
        items.push({
            key: '/company/reports',
            icon: <BarChartOutlined />,
            label: 'Отчёты',
        });

        // --- КАБИНЕТ (справочники, организация, сотрудники) ---
        items.push({
            key: '/company/cabinet',
            icon: <ApartmentOutlined />,
            label: 'Кабинет',
        });

        return items;
    };

    // Доступен ли текущий раздел этому человеку. Правило то же, что у меню.
    const sectionAccess = checkSectionAccess(pathname, user);

    // Готов ли раздел. Проверяем здесь, а не на каждой странице: по прямой
    // ссылке и из закладок человек приходит мимо меню.
    const beta = getBetaSection(pathname);

    const userMenu = {
        items: [
            {
                key: 'updates',
                icon: <NotificationOutlined style={{ color: hasNewUpdates ? '#ff4d4f' : undefined }} />,
                label: (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
                        <span>Что нового?</span>
                        {hasNewUpdates && (
                            <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#ff4d4f',
                                display: 'inline-block'
                            }} />
                        )}
                    </div>
                ),
                onClick: () => {
                    window.dispatchEvent(new Event('logicore:open-updates'));
                }
            },
            {
                type: 'divider' as const,
            },
            {
                key: 'profile',
                icon: <UserOutlined />,
                label: 'Профиль',
                onClick: () => router.push('/company/profile'),
            },
            // «Настройки» — реквизиты, печать и организации компании: их
            // меняет руководитель. Пункт показывали всем, и бухгалтер с
            // завскладом попадали на экран, где каждая кнопка отвечает
            // отказом. Свои данные и пароль — в «Профиле», он остаётся.
            ...(checkSectionAccess('/company/settings', user).allowed ? [{
                key: '/company/settings',
                icon: <SettingOutlined />,
                label: 'Настройки',
                onClick: () => router.push('/company/settings'),
            }] : []),
            {
                type: 'divider' as const,
            },
            {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: 'Выйти',
                onClick: handleLogout,
            },
        ],
    };

    /**
     * Мобильное меню.
     *
     * Список свой, а не `Menu` из Ant Design. Тот красил текущий пункт синим
     * — цветом, который в кабинете означает ссылку, а не выделение, — и на
     * телефоне навигация выглядела из другого продукта. Здесь тот же вид,
     * что у пилюль наверху: тёмная заливка и текст фоном страницы.
     *
     * «Мониторинг» на телефоне разложен сразу: выпадающий список внутри
     * выдвижного ящика — лишнее нажатие ради двух строк.
     */
    const MobileMenu = () => (
        <Drawer
            title={user.company?.name || 'Меню'}
            placement="left"
            onClose={() => setMobileMenuOpen(false)}
            open={mobileMenuOpen}
            width={286}
            className="lc-nova"
            styles={{ body: { padding: 12 }, header: { background: 'var(--nova-surface-2)' } }}
        >
            <nav className="lc-mnav">
                {getMenuItems().map((item: any) => {
                    if (item.children) {
                        return (
                            <div className="lc-mnav-group" key={item.key}>
                                <div className="lc-mnav-cap">{item.label}</div>
                                {item.children.map((child: any) => (
                                    <button
                                        type="button"
                                        key={child.key}
                                        className={`lc-mnav-item${isNavItemActive(child, pathname) ? ' is-on' : ''}`}
                                        onClick={() => handleMenuClick(child.key)}
                                    >
                                        <i>{child.icon}</i>
                                        <span>{child.label}</span>
                                    </button>
                                ))}
                            </div>
                        );
                    }
                    return (
                        <button
                            type="button"
                            key={item.key}
                            className={`lc-mnav-item${isNavItemActive(item, pathname) ? ' is-on' : ''}`}
                            onClick={() => handleMenuClick(item.key)}
                        >
                            <i>{item.icon}</i>
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="lc-mnav-foot">
                <button type="button" className="lc-mnav-out" onClick={handleLogout}>
                    <LogoutOutlined /> Выйти
                </button>
            </div>
        </Drawer>
    );

    return (
        <Layout className="lc-nova" style={{ minHeight: '100vh', background: 'var(--nova-bg)' }}>
            {/* Mobile Drawer */}
            {isMobile && <MobileMenu />}

            {/* Top Header Navigation */}
            <Header
                className="app-header-2026"
                style={{
                    // Шапка белая, холст страницы серый — так верхняя полоса
                    // читается как отдельный слой, а не как продолжение фона.
                    // Раньше здесь стоял --lc-bg, то есть тот же серый.
                    background: 'var(--lc-card)',
                    backdropFilter: 'saturate(1.9) blur(20px)',
                    WebkitBackdropFilter: 'saturate(1.9) blur(20px)',
                    padding: '0 24px',
                    display: 'flex',
                    alignItems: 'center',
                    height: 60,
                    borderBottom: '1px solid var(--lc-border)',
                    position: 'sticky',
                    left: 0,
                    right: 0,
                    top: 0,
                    zIndex: 100,
                }}
            >
                {/* Дорожка шапки: та же ширина и те же поля, что у страницы —
                    вертикали обязаны совпадать по всей высоте экрана. */}
                <div className="nova-bar">
                {/* Mobile: burger button */}
                {isMobile && (
                    <Button
                        type="text"
                        icon={<MenuOutlined />}
                        onClick={() => setMobileMenuOpen(true)}
                        style={{ marginRight: 8, color: 'var(--lc-text)' }}
                    />
                )}

                {/* Logo: словомарка LogiCore */}
                <div
                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginRight: 18, flexShrink: 0 }}
                    onClick={() => router.push('/company')}
                >
                    <span className="nova-brand">Logi<span>Core</span></span>
                </div>

                {/* Desktop: пилюльная навигация */}
                {!isMobile && (
                    <nav className="lc2-nav">
                        {getMenuItems().map((item: any) => {
                            const active = isNavItemActive(item, pathname);

                            if (item.children) {
                                return (
                                    <Dropdown
                                        key={item.key}
                                        trigger={['hover', 'click']}
                                        overlayClassName="lc2-nav-drop"
                                        transitionName=""
                                        menu={{
                                            items: item.children,
                                            onClick: ({ key }) => { if (key.startsWith('/')) router.push(key); },
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className={`lc2-nav-item${active ? ' active' : ''}`}
                                            data-menu-id={`lc2-${item.key}`}
                                        >
                                            {item.label}
                                        </button>
                                    </Dropdown>
                                );
                            }
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={`lc2-nav-item${active ? ' active' : ''}`}
                                    data-menu-id={`lc2-${item.key}`}
                                    onClick={() => router.push(item.key)}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>
                )}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Right section */}
                <div className="lc2-header-right">
                    {/* AI-ассистент */}
                    <AiButton />

                    {/* Глобальный поиск */}
                    <GlobalSearch />

                    {/* Центр уведомлений (Этап 7) */}
                    <NotificationBell hasNewUpdates={hasNewUpdates} />

                    {/* Тема — один круглый значок, как на главной. Капсула из
                        двух половин занимала вдвое больше места и выбивалась
                        из ряда одинаковых круглых кнопок рядом. */}
                    <button
                        type="button"
                        className="nova-iconbtn"
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                        aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                    >
                        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    </button>

                    <div className="lc2-header-divider" />

                    {/* User Profile */}
                    <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']} overlayClassName="lc2-nav-drop" transitionName="">
                        <div
                            className="lc2-profile user-profile-trigger"
                            data-guide="profile"
                            style={{
                                boxShadow: hasNewUpdates ? '0 0 0 2px rgba(255, 77, 79, 0.35), 0 0 12px rgba(255, 77, 79, 0.25)' : undefined,
                                animation: hasNewUpdates ? 'profileGlow 2s infinite' : undefined,
                            }}
                        >
                            <UserAvatar
                                userId={user.id}
                                hasAvatar={!!(user as any).avatarPath}
                                size={32}
                                fallback={
                                    <span className="lc2-profile-av">
                                        {((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || <UserOutlined />}
                                    </span>
                                }
                            />
                            {/* Имя с должностью — самая широкая часть правого
                                угла. На узком экране её убирает CSS
                                (`lc2-profile-who`), а не второй порог в коде:
                                два порога в разных местах разъезжаются. */}
                            {!isMobile && (
                                <div className="lc2-profile-who" style={{ lineHeight: 1.25 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lc-text)', whiteSpace: 'nowrap' }}>
                                        {user.firstName} {user.lastName}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#8a91a0', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {ROLE_LABELS[user.role] || user.role}{user.company?.name ? ` · ${shortenCompanyName(user.company.name)}` : ''}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Dropdown>
                </div>
                </div>
            </Header>

            {/* Тикер живых событий (глобальный) */}
            <LiveEventTicker />

            {/* Content */}
            <Layout style={{ background: 'var(--nova-bg)', padding: 0 }}>
                <Content
                    data-guide="content"
                    className="page-content-anim"
                    style={{
                        margin: 0,
                        padding: 0,
                        background: 'transparent',
                        borderRadius: 0,
                        border: 'none',
                        minHeight: 'calc(100vh - 60px - 40px)',
                        boxShadow: 'none',
                        overflow: 'auto',
                    }}
                >
                    {billingStatus?.enabled && billingStatus?.blocked ? (
                        <PaywallScreen status={billingStatus} />
                    ) : (
                        <>
                            {/* Полоска про бесплатные дни. Показывается всем
                                сотрудникам, а не только руководителю: плитка
                                «Тариф» есть лишь у него, а закроется кабинет
                                у всех сразу. Слова разные — «пробный период»
                                у новой компании и «дни на оплату» у той, что
                                уже работала, когда назначили цену. */}
                            {billingStatus?.enabled && !billingStatus?.blocked && billingStatus?.trialEndsAt
                                && ['TRIAL', 'GRACE'].includes(billingStatus?.status) && (
                                    <div className="lc-trial-banner">
                                        {billingStatus.status === 'GRACE' ? 'Оплатить подписку' : 'Пробный период'} до{' '}
                                        {new Date(billingStatus.trialEndsAt).toLocaleDateString('ru-RU')} — осталось{' '}
                                        {Math.max(0, Math.ceil((new Date(billingStatus.trialEndsAt).getTime() - Date.now()) / 86400000))} дн.
                                    </div>
                                )}
                            {/* Прямая ссылка в чужой раздел раньше открывала
                                страницу: она грузилась, запросы получали отказ,
                                и человек видел пустой экран без объяснений.
                                Теперь — понятная причина. Главным остаётся
                                сервер, здесь только объяснение. */}
                            {!sectionAccess.allowed ? (
                                <NoSectionAccess title={sectionAccess.title} roleLabel={ROLE_LABELS[user.role] || user.role} />
                            ) : beta?.state === 'closed' ? (
                                <BetaClosed section={beta} />
                            ) : (
                                <>
                                    {beta?.state === 'beta' && <BetaStrip section={beta} />}
                                    {children}
                                </>
                            )}
                        </>
                    )}
                </Content>
            </Layout>

            <AssistantWidget />
        </Layout >
    );
}
