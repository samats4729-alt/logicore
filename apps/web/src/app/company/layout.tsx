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
    SearchOutlined,
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
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';
import dynamic from 'next/dynamic';

const { Header, Content } = Layout;
const { Text } = Typography;

const AssistantWidget = dynamic(() => import('@/components/ui/AssistantWidget'), { ssr: false });

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isTrackingPage = pathname === '/company/tracking';
    const { user, logout, checkAuth, isLoading } = useAuthStore();

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const [hydrated, setHydrated] = useState(false);

    // Определяем мобильное устройство
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
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

        // --- ЗАЯВКИ ---
        const ordersChildren: any[] = [];
        if (hasPerm('orders')) {
            ordersChildren.push({
                key: '/company/orders',
                icon: <FileTextOutlined />,
                label: 'Все заявки',
            });
            ordersChildren.push({
                key: '/company/search',
                icon: <SearchOutlined />,
                label: 'Биржа грузов',
            });
        }
        if (ordersChildren.length > 0) {
            items.push({
                key: 'orders_group',
                icon: <FileTextOutlined />,
                label: 'Заявки',
                children: ordersChildren,
            });
        }

        // --- ЛОГИСТИКА ---
        const logisticsChildren: any[] = [];
        if (hasPerm('tracking')) {
            logisticsChildren.push({
                key: '/company/tracking',
                icon: <EnvironmentOutlined />,
                label: 'GPS / Мониторинг',
            });
        }
        if (user.role === 'WAREHOUSE_MANAGER' || ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            logisticsChildren.push({
                key: '/company/warehouse',
                icon: <HomeOutlined />,
                label: 'Склад',
            });
        }
        if (logisticsChildren.length > 0) {
            items.push({
                key: 'logistics_group',
                icon: <CompassOutlined />,
                label: 'Логистика',
                children: logisticsChildren,
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
        if (financeChildren.length > 0) {
            items.push({
                key: 'finance_group',
                icon: <DollarOutlined />,
                label: 'Финансы',
                children: financeChildren,
            });
        }

        // --- КОМПАНИЯ ---
        const companyChildren: any[] = [];
        if (hasPerm('partners')) {
            companyChildren.push({
                key: '/company/partners',
                icon: <TeamOutlined />,
                label: 'Контрагенты',
            });
            companyChildren.push({
                key: '/company/contracts',
                icon: <FileProtectOutlined />,
                label: 'Договоры',
            });
        }
        if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            companyChildren.push({
                key: '/company/vehicles',
                icon: <CarOutlined />,
                label: 'Транспорт',
            });
            companyChildren.push({
                key: '/company/users',
                icon: <UserSwitchOutlined />,
                label: 'Сотрудники',
            });
        }
        companyChildren.push({
            key: '/company/locations',
            icon: <PushpinOutlined />,
            label: 'Адреса',
        });
        if (hasPerm('documents')) {
            companyChildren.push({
                key: '/company/documents',
                icon: <InboxOutlined />,
                label: 'Документы',
            });
        }
        if (companyChildren.length > 0) {
            items.push({
                key: 'company_group',
                icon: <TeamOutlined />,
                label: 'Компания',
                children: companyChildren,
            });
        }

        items.push({
            key: '/company/calculator',
            icon: <CalculatorOutlined />,
            label: 'Калькулятор',
        });

        items.push({
            key: '/company/settings',
            icon: <SettingOutlined />,
            label: 'Настройки',
        });

        return items;
    };

    const userMenu = {
        items: [
            {
                key: 'profile',
                icon: <UserOutlined />,
                label: 'Профиль',
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
                style={{
                    background: 'rgba(255, 255, 255, 0.82)',
                    backdropFilter: 'saturate(1.8) blur(14px)',
                    WebkitBackdropFilter: 'saturate(1.8) blur(14px)',
                    padding: '0 24px',
                    display: 'flex',
                    alignItems: 'center',
                    height: 56,
                    borderBottom: '1px solid #e7e8ec',
                    position: 'sticky',
                    left: 0,
                    right: 0,
                    top: 0,
                    zIndex: 100,
                    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.03)',
                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* Mobile: burger button */}
                {isMobile && (
                    <Button
                        type="text"
                        icon={<MenuOutlined />}
                        onClick={() => setMobileMenuOpen(true)}
                        style={{ marginRight: 8 }}
                    />
                )}

                {/* Logo */}
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginRight: 14, flexShrink: 0 }}
                    onClick={() => router.push('/company')}
                >
                    <div style={{
                        width: 28, height: 28, background: 'linear-gradient(135deg, #1677ff 0%, #0b5ed7 100%)', borderRadius: 9,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(22, 119, 255, 0.35)',
                    }}>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>L</span>
                    </div>
                    {!isMobile && (
                        <Text strong className="logo-text" style={{ fontSize: 14, color: isTrackingPage ? undefined : '#09090b', fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                            {user.company?.name || 'LogiCore'}
                        </Text>
                    )}
                </div>

                {/* Desktop horizontal menu */}
                {!isMobile && (
                    <Menu
                        mode="horizontal"
                        selectedKeys={[pathname]}
                        items={getMenuItems()}
                        onClick={({ key }) => {
                            if (key.startsWith('/')) {
                                router.push(key);
                            }
                        }}
                        style={{
                            flex: 1,
                            border: 'none',
                            background: 'transparent',
                            lineHeight: '54px',
                            minWidth: 0,
                        }}
                        className="premium-menu"
                    />
                )}

                {/* Spacer for mobile */}
                {isMobile && <div style={{ flex: 1 }} />}

                {/* User Profile */}
                <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                        marginLeft: 8,
                    }}
                        className="user-profile-trigger"
                    >
                        <Avatar
                            icon={<UserOutlined />}
                            size="small"
                            style={{ background: '#ffffff', color: '#09090b', border: '1px solid #e4e4e7', flexShrink: 0 }}
                        />
                        {!isMobile && (
                            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap', color: isTrackingPage ? 'inherit' : undefined }}>
                                {user.firstName} {user.lastName}
                            </Text>
                        )}
                    </div>
                </Dropdown>
            </Header>

            {/* Content */}
            <Layout style={{ background: '#f6f7f9', padding: isTrackingPage ? 0 : (isMobile ? 0 : 24) }}>
                <Content
                    data-guide="content"
                    className={isTrackingPage ? undefined : 'page-content-anim'}
                    style={{
                        margin: isTrackingPage ? 0 : (isMobile ? 16 : 0),
                        padding: isTrackingPage ? 0 : (isMobile ? 16 : 32),
                        background: isTrackingPage ? 'transparent' : '#ffffff',
                        borderRadius: isTrackingPage ? 0 : 20,
                        border: isTrackingPage ? 'none' : '1px solid #e8e9ee',
                        minHeight: isTrackingPage ? 'calc(100vh - 56px)' : 'calc(100vh - 56px - 48px)',
                        boxShadow: isTrackingPage ? 'none' : '0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 32px -20px rgba(16, 24, 40, 0.12)',
                        overflow: isTrackingPage ? 'hidden' : 'auto',
                    }}
                >
                    {children}
                </Content>
            </Layout>

            <AssistantWidget />
        </Layout >
    );
}
