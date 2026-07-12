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
    DatabaseOutlined,
    ApartmentOutlined,
    CompassOutlined,
    HomeOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FileExcelOutlined,
    RiseOutlined,
    FileProtectOutlined,
    UserSwitchOutlined,
    CalculatorOutlined,
    BarChartOutlined,
    NotificationOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { shortenCompanyName } from '@/lib/company-helper';
import NotificationBell from '@/components/ui/NotificationBell';
import { useTheme } from '@/components/ThemeProvider';
import AiButton from '@/components/ui/AiButton';
import { LiveEventTicker } from '@/components/ui/LiveTicker';
import GlobalSearch from '@/components/ui/GlobalSearch';
import UserAvatar from '@/components/UserAvatar';
import PaywallScreen from '@/components/PaywallScreen';

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
            }
        });
    }, [hydrated, checkAuth, router, logout]);

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

        // --- МОНИТОРИНГ ---
        const monitoringChildren: any[] = [];
        if (hasPerm('tracking')) {
            monitoringChildren.push({
                key: '/company/tracking',
                icon: <EnvironmentOutlined />,
                label: 'GPS / Мониторинг',
            });
        }
        if (user.role === 'WAREHOUSE_MANAGER' || ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            monitoringChildren.push({
                key: '/company/warehouse',
                icon: <HomeOutlined />,
                label: 'Склад',
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

        // --- СПРАВОЧНИКИ (бывш. «Транспорт»: контрагенты, договоры, адреса, автопарк, документы) ---
        const directoryChildren: any[] = [];
        if (hasPerm('partners')) {
            directoryChildren.push({
                key: '/company/partners',
                icon: <TeamOutlined />,
                label: 'Контрагенты',
            });
            directoryChildren.push({
                key: '/company/contracts',
                icon: <FileProtectOutlined />,
                label: 'Договоры',
            });
        }
        directoryChildren.push({
            key: '/company/locations',
            icon: <PushpinOutlined />,
            label: 'Адреса',
        });
        if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            directoryChildren.push({
                key: '/company/vehicles',
                icon: <CarOutlined />,
                label: 'Автопарк',
            });
        }
        if (hasPerm('documents')) {
            directoryChildren.push({
                key: '/company/documents',
                icon: <InboxOutlined />,
                label: 'Документы',
            });
        }
        items.push({
            key: 'directory_group',
            popupClassName: 'lc-nav-pop',
            icon: <DatabaseOutlined />,
            label: 'Справочники',
            children: directoryChildren,
        });

        // --- ФИНАНСЫ (секции: Операции / Отчёты / Инструменты) ---
        const financeChildren: any[] = [];
        if (hasPerm('accounting')) {
            financeChildren.push({
                type: 'group',
                label: 'Операции',
                children: [
                    {
                        key: '/company/accounting/invoices',
                        icon: <FileOutlined />,
                        label: 'Счета',
                    },
                    {
                        key: '/company/accounting/incomes',
                        icon: <ArrowUpOutlined />,
                        label: 'Поступления',
                    },
                    {
                        key: '/company/accounting/expenses',
                        icon: <ArrowDownOutlined />,
                        label: 'Расходы',
                    },
                    {
                        key: '/company/accounting/registry',
                        icon: <ArrowUpOutlined />,
                        label: 'Реестр заявок',
                    },
                ],
            });
            financeChildren.push({
                type: 'group',
                label: 'Отчёты',
                children: [
                    {
                        key: '/company/accounting',
                        icon: <BarChartOutlined />,
                        label: 'Бухгалтерия',
                    },
                    {
                        key: '/company/accounting/cashflow',
                        icon: <FileExcelOutlined />,
                        label: 'ДДС',
                    },
                    {
                        key: '/company/accounting/pnl',
                        icon: <RiseOutlined />,
                        label: 'P&L',
                    },
                    {
                        key: '/company/accounting/counterparty-report',
                        icon: <TeamOutlined />,
                        label: 'Взаиморасчёты',
                    },
                    {
                        key: '/company/reports',
                        icon: <BarChartOutlined />,
                        label: 'Отчёты',
                    },
                ],
            });
        }
        // Инструменты: зарплата, калькулятор, статьи (калькулятор доступен всем)
        const financeTools: any[] = [];
        if (hasPerm('accounting') && ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            financeTools.push({
                key: '/company/payroll',
                icon: <DollarOutlined />,
                label: 'Зарплата',
            });
        }
        if (user.role === 'LOGISTICIAN') {
            financeTools.push({
                key: '/company/my-salary',
                icon: <DollarOutlined />,
                label: 'Моя зарплата',
            });
        }
        financeTools.push({
            key: '/company/calculator',
            icon: <CalculatorOutlined />,
            label: 'Калькулятор',
        });
        if (hasPerm('accounting')) {
            financeTools.push({
                key: '/company/accounting/settings',
                icon: <SettingOutlined />,
                label: 'Статьи',
            });
        }
        financeChildren.push({
            type: 'group',
            label: 'Инструменты',
            children: financeTools,
        });

        items.push({
            key: 'finance_group',
            popupClassName: 'lc-nav-pop',
            icon: <DollarOutlined />,
            label: 'Финансы',
            children: financeChildren,
        });

        // --- КОМПАНИЯ (сотрудники, настройки) ---
        const companyChildren: any[] = [];
        if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            companyChildren.push({
                key: '/company/users',
                icon: <UserSwitchOutlined />,
                label: 'Сотрудники',
            });
        }
        if (auditEnabled && ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            companyChildren.push({
                key: '/company/audit',
                icon: <FileProtectOutlined />,
                label: 'Журнал действий',
            });
        }
        companyChildren.push({
            key: '/company/settings',
            icon: <SettingOutlined />,
            label: 'Настройки',
        });
        items.push({
            key: 'company_group',
            popupClassName: 'lc-nav-pop',
            icon: <ApartmentOutlined />,
            label: 'Компания',
            children: companyChildren,
        });

        return items;
    };

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
            {
                key: '/company/settings',
                icon: <SettingOutlined />,
                label: 'Настройки',
                onClick: () => router.push('/company/settings'),
            },
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
        <Layout style={{ minHeight: '100vh', background: 'var(--lc-bg)' }}>
            {/* Mobile Drawer */}
            {isMobile && <MobileMenu />}

            {/* Top Header Navigation */}
            <Header
                className="app-header-2026"
                style={{
                    background: 'var(--lc-bg)',
                    backdropFilter: 'saturate(1.9) blur(20px)',
                    WebkitBackdropFilter: 'saturate(1.9) blur(20px)',
                    padding: '0 24px',
                    display: 'flex',
                    alignItems: 'center',
                    height: 60,
                    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                    position: 'sticky',
                    left: 0,
                    right: 0,
                    top: 0,
                    zIndex: 100,
                }}
            >
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
                    <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--lc-text)', whiteSpace: 'nowrap' }}>
                        Logi<span style={{ color: '#1677ff' }}>Core</span>
                    </span>
                </div>

                {/* Desktop: пилюльная навигация */}
                {!isMobile && (
                    <nav className="lc2-nav">
                        {getMenuItems().map((item: any) => {
                            const childKeys: string[] = (item.children || [])
                                .flatMap((c: any) => (c?.type === 'group' && Array.isArray(c.children)) ? c.children : [c])
                                .filter((c: any) => c?.key && String(c.key).startsWith('/'))
                                .map((c: any) => String(c.key));
                            const active = item.key === '/company'
                                ? pathname === '/company'
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

                    {/* Тема (Этап 8) — капсульный переключатель */}
                    <div className="lc2-theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'} aria-label="Переключить тему">
                        <div className="lc2-theme-active-bg" style={{ transform: theme === 'dark' ? 'translateX(32px)' : 'translateX(0px)' }} />
                        <span className={`lc2-theme-btn sun${theme === 'light' ? ' active' : ''}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5" />
                                <line x1="12" y1="1" x2="12" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="23" />
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                <line x1="1" y1="12" x2="3" y2="12" />
                                <line x1="21" y1="12" x2="23" y2="12" />
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                            </svg>
                        </span>
                        <span className={`lc2-theme-btn moon${theme === 'dark' ? ' active' : ''}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        </span>
                    </div>

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
                            {!isMobile && (
                                <div style={{ lineHeight: 1.25 }}>
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
            </Header>

            {/* Тикер живых событий (глобальный) */}
            <LiveEventTicker />

            {/* Content */}
            <Layout style={{ background: 'var(--lc-bg)', padding: isMobile ? 0 : '16px 24px 24px' }}>
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
                            {children}
                        </>
                    )}
                </Content>
            </Layout>

            <AssistantWidget />
        </Layout >
    );
}
