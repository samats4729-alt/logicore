'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Button, Avatar, Dropdown, Typography, Spin, Drawer } from 'antd';
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

const ROLE_LABELS: Record<string, string> = {
    COMPANY_ADMIN: 'Администратор',
    LOGISTICIAN: 'Логист',
    FORWARDER: 'Экспедитор',
    ACCOUNTANT: 'Бухгалтер',
    WAREHOUSE_MANAGER: 'Завскладом',
    PARTNER: 'Партнёр',
};

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
                <Spin size="large" />
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

    // Мобильное меню через Drawer
    const MobileMenu = () => (
        <Drawer
            title={user.company?.name || 'Меню'}
            placement="left"
            onClose={() => setMobileMenuOpen(false)}
            open={mobileMenuOpen}
            width={280}
            styles={{ body: { padding: 0 } }}
        >
            <Menu
                mode="inline"
                selectedKeys={[pathname]}
                items={getMenuItems()}
                onClick={({ key }) => handleMenuClick(key)}
                style={{ border: 'none' }}
            />
            <div style={{ padding: 16, borderTop: '1px solid var(--lc-border)', marginTop: 16 }}>
                <Button
                    type="text"
                    danger
                    icon={<LogoutOutlined />}
                    onClick={handleLogout}
                    block
                >
                    Выйти
                </Button>
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
                            const childKeys: string[] = (item.children || [])
                                .flatMap((c: any) => (c?.type === 'group' && Array.isArray(c.children)) ? c.children : [c])
                                .filter((c: any) => c?.key && String(c.key).startsWith('/'))
                                .map((c: any) => String(c.key));
                            // Хаб-страницы подсвечиваются и на своих подстраницах.
                            // Списки не пересекаются: путь, попавший в два,
                            // подсветил бы разом две пилюли.
                            const cabinetRoutes = [
                                '/company/cabinet', '/company/users', '/company/settings', '/company/audit',
                                '/company/partners', '/company/contracts', '/company/locations',
                                '/company/vehicles', '/company/documents', '/company/profile',
                                '/company/accounting/settings', '/company/accounting/payment-conditions',
                                '/company/accounting/payment-forms', '/company/accounting/ownership-types',
                                '/company/accounting/banks', '/company/accounting/currencies',
                                '/company/accounting/revaluation', '/company/accounting/document-numbering',
                                '/company/accounting/order-numbering',
                                '/company/inventory/nomenclature', '/company/inventory/warehouses',
                            ];
                            const financeRoutes = [
                                '/company/finance', '/company/accounting/invoices', '/company/accounting/acts',
                                '/company/accounting/transport-documents', '/company/accounting/incoming',
                                '/company/accounting/calendar', '/company/accounting/planned',
                                '/company/accounting/cash-in', '/company/accounting/cash-out',
                                '/company/accounting/operations', '/company/accounting/balances',
                                '/company/accounting/counterparty-report', '/company/accounting/reconciliation-act',
                                '/company/accounting/opening-balances', '/company/accounting/act-of-work',
                                '/company/inventory/balances', '/company/inventory/receipts',
                                '/company/inventory/transfers', '/company/inventory/writeoffs',
                                '/company/payroll', '/company/my-salary',
                            ];
                            const reportsRoutes = [
                                '/company/reports', '/company/accounting/pnl', '/company/accounting/carrier-profit',
                                '/company/accounting/registry', '/company/accounting/cashflow',
                                '/company/accounting/expenses-by-category',
                            ];
                            const requestsRoutes = ['/company/requests', '/company/calculator'];
                            const hubRoutes: Record<string, string[]> = {
                                '/company/cabinet': cabinetRoutes,
                                '/company/finance': financeRoutes,
                                '/company/reports': reportsRoutes,
                                '/company/requests': requestsRoutes,
                            };
                            const active = item.key === '/company'
                                ? pathname === '/company'
                                : hubRoutes[item.key as string]
                                    ? hubRoutes[item.key as string].some(k => pathname === k || pathname.startsWith(k + '/'))
                                    : String(item.key).startsWith('/')
                                        ? (pathname === item.key || pathname.startsWith(item.key + '/'))
                                        : childKeys.some(k => pathname === k || pathname.startsWith(k + '/'));

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
                            {billingStatus?.enabled && !billingStatus?.blocked && billingStatus?.status === 'TRIAL' && billingStatus?.trialEndsAt && (
                                <div className="lc-trial-banner">
                                    Пробный период до {new Date(billingStatus.trialEndsAt).toLocaleDateString('ru-RU')} — осталось{' '}
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
