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
    UserSwitchOutlined,
    CalculatorOutlined,
    BarChartOutlined,
    NotificationOutlined,
    BellOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { shortenCompanyName } from '@/lib/company-helper';

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

        // --- МОНИТОРИНГ (бывш. «Логистика») ---
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

        // --- ФИНАНСЫ ---
        const financeChildren: any[] = [];
        if (hasPerm('accounting')) {
            financeChildren.push({
                key: '/company/accounting',
                icon: <BarChartOutlined />,
                label: 'Бухгалтерия',
            });
            financeChildren.push({ type: 'divider' });
            financeChildren.push({
                key: '/company/accounting/registry',
                icon: <ArrowUpOutlined />,
                label: 'Реестр заявок',
            });
            financeChildren.push({
                key: '/company/accounting/incomes',
                icon: <ArrowUpOutlined />,
                label: 'Поступления',
            });
            financeChildren.push({
                key: '/company/accounting/expenses',
                icon: <ArrowDownOutlined />,
                label: 'Расходы',
            });
            financeChildren.push({ type: 'divider' });
            financeChildren.push({
                key: '/company/accounting/cashflow',
                icon: <FileExcelOutlined />,
                label: 'ДДС',
            });
            financeChildren.push({
                key: '/company/accounting/pnl',
                icon: <RiseOutlined />,
                label: 'P&L',
            });
            financeChildren.push({
                key: '/company/accounting/counterparty-report',
                icon: <TeamOutlined />,
                label: 'Взаиморасчёты',
            });
            if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
                financeChildren.push({
                    key: '/company/payroll',
                    icon: <DollarOutlined />,
                    label: 'Зарплата',
                });
            }
            financeChildren.push({ type: 'divider' });
            financeChildren.push({
                key: '/company/accounting/invoices',
                icon: <FileOutlined />,
                label: 'Счета',
            });
            financeChildren.push({
                key: '/company/accounting/settings',
                icon: <SettingOutlined />,
                label: 'Статьи',
            });
            financeChildren.push({
                key: '/company/reports',
                icon: <BarChartOutlined />,
                label: 'Отчёты',
            });
        }
        // Калькулятор и Моя зарплата — в группу Финансы (доступны без бухгалтерского разрешения)
        if (user.role === 'LOGISTICIAN') {
            if (financeChildren.length > 0) financeChildren.push({ type: 'divider' });
            financeChildren.push({
                key: '/company/my-salary',
                icon: <DollarOutlined />,
                label: 'Моя зарплата',
            });
        }
        if (financeChildren.length > 0) financeChildren.push({ type: 'divider' });
        financeChildren.push({
            key: '/company/calculator',
            icon: <CalculatorOutlined />,
            label: 'Калькулятор',
        });

        items.push({
            key: 'finance_group',
            popupClassName: 'lc-nav-pop',
            icon: <DollarOutlined />,
            label: 'Финансы',
            children: financeChildren,
        });

        // --- ТРАНСПОРТ (бывш. «Компания») ---
        const transportChildren: any[] = [];
        if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            transportChildren.push({
                key: '/company/vehicles',
                icon: <CarOutlined />,
                label: 'Автопарк',
            });
        }
        if (hasPerm('partners')) {
            transportChildren.push({
                key: '/company/partners',
                icon: <TeamOutlined />,
                label: 'Контрагенты',
            });
            transportChildren.push({
                key: '/company/contracts',
                icon: <FileProtectOutlined />,
                label: 'Договоры',
            });
        }
        if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            transportChildren.push({
                key: '/company/users',
                icon: <UserSwitchOutlined />,
                label: 'Сотрудники',
            });
        }
        transportChildren.push({
            key: '/company/locations',
            icon: <PushpinOutlined />,
            label: 'Адреса',
        });
        if (hasPerm('documents')) {
            transportChildren.push({
                key: '/company/documents',
                icon: <InboxOutlined />,
                label: 'Документы',
            });
        }
        if (transportChildren.length > 0) {
            items.push({
                key: 'transport_group',
                popupClassName: 'lc-nav-pop',
                icon: <CarOutlined />,
                label: 'Транспорт',
                children: transportChildren,
            });
        }

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
            },
            {
                key: 'settings',
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
            <div style={{ padding: 16, borderTop: '1px solid #f0f0f0', marginTop: 16 }}>
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
        <Layout style={{ minHeight: '100vh', background: '#f6f7f9' }}>
            {/* Mobile Drawer */}
            {isMobile && <MobileMenu />}

            {/* Top Header Navigation */}
            <Header
                className="app-header-2026"
                style={{
                    background: 'rgba(246, 247, 249, 0.88)',
                    backdropFilter: 'saturate(1.8) blur(14px)',
                    WebkitBackdropFilter: 'saturate(1.8) blur(14px)',
                    padding: '0 24px',
                    display: 'flex',
                    alignItems: 'center',
                    height: 64,
                    borderBottom: '1px solid rgba(231, 232, 236, 0.6)',
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
                        style={{ marginRight: 8, color: '#0b0d12' }}
                    />
                )}

                {/* Logo: словомарка LogiCore */}
                <div
                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginRight: 18, flexShrink: 0 }}
                    onClick={() => router.push('/company')}
                >
                    <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: '#0b0d12', whiteSpace: 'nowrap' }}>
                        Logi<span style={{ color: '#1677ff' }}>Core</span>
                    </span>
                </div>

                {/* Desktop: пилюльная навигация */}
                {!isMobile && (
                    <nav className="lc2-nav">
                        {getMenuItems().map((item: any) => {
                            const childKeys: string[] = (item.children || [])
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
                    {/* Поиск (заглушка — Этап 6) */}
                    <button
                        type="button"
                        className="lc2-iconbtn"
                        aria-label="Поиск"
                        title="Глобальный поиск"
                    >
                        <SearchOutlined />
                    </button>

                    {/* Уведомления */}
                    <button
                        type="button"
                        className="lc2-iconbtn"
                        aria-label="Уведомления"
                        onClick={() => window.dispatchEvent(new Event('logicore:open-updates'))}
                    >
                        <BellOutlined />
                        {hasNewUpdates && <span className="lc2-dot" />}
                    </button>

                    {/* Тема (заглушка — Этап 8) */}
                    <button
                        type="button"
                        className="lc2-iconbtn"
                        aria-label="Переключить тему"
                        title="Светлая / тёмная тема"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    </button>

                    <div className="lc2-header-divider" />

                    {/* User Profile */}
                    <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
                        <div
                            className="lc2-profile user-profile-trigger"
                            style={{
                                boxShadow: hasNewUpdates ? '0 0 0 2px rgba(255, 77, 79, 0.35), 0 0 12px rgba(255, 77, 79, 0.25)' : undefined,
                                animation: hasNewUpdates ? 'profileGlow 2s infinite' : undefined,
                            }}
                        >
                            <span className="lc2-profile-av">
                                {((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || <UserOutlined />}
                            </span>
                            {!isMobile && (
                                <div style={{ lineHeight: 1.25 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0b0d12', whiteSpace: 'nowrap' }}>
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

            {/* Content */}
            <Layout style={{ background: '#f6f7f9', padding: isMobile ? 0 : 24 }}>
                <Content
                    data-guide="content"
                    className="page-content-anim"
                    style={{
                        margin: isMobile ? 16 : 0,
                        padding: isMobile ? 16 : 24,
                        background: '#ffffff',
                        borderRadius: 20,
                        border: '1px solid #e8e9ee',
                        minHeight: 'calc(100vh - 56px - 48px)',
                        boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 32px -20px rgba(16, 24, 40, 0.12)',
                        overflow: 'auto',
                    }}
                >
                    {children}
                </Content>
            </Layout>

            <AssistantWidget />
        </Layout >
    );
}
