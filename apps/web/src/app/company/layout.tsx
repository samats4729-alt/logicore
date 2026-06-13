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
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Header, Content } = Layout;
const { Text } = Typography;

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
            setIsMobile(window.innerWidth < 768);
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

        if (hasPerm('orders')) {
            items.push({
                key: '/company/orders',
                icon: <FileTextOutlined />,
                label: 'Заявки',
            });
        }

        // --- ЛОГИСТИКА ---
        const logisticsChildren: any[] = [];
        if (hasPerm('orders')) {
            logisticsChildren.push({
                key: '/company/search',
                icon: <SearchOutlined />,
                label: 'Биржа грузов',
            });
        }
        if (hasPerm('tracking')) {
            logisticsChildren.push({
                key: '/company/tracking',
                icon: <EnvironmentOutlined />,
                label: 'Карта',
            });
        }
        if (user.role === 'WAREHOUSE_MANAGER' || ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            logisticsChildren.push({
                key: '/company/warehouse',
                icon: <InboxOutlined />,
                label: 'Очередь погрузки',
            });
        }
        if (logisticsChildren.length > 0) {
            items.push({
                key: 'logistics_group',
                icon: <ApartmentOutlined />,
                label: 'Логистика',
                children: logisticsChildren,
            });
        }

        // --- ПАРТНЁРЫ ---
        const partnersChildren: any[] = [];
        if (hasPerm('partners')) {
            partnersChildren.push({
                key: '/company/partners',
                icon: <TeamOutlined />,
                label: 'Контрагенты',
            });
            partnersChildren.push({
                key: '/company/contracts',
                icon: <FileTextOutlined />,
                label: 'Договоры',
            });
        }
        if (hasPerm('drivers')) {
            partnersChildren.push({
                key: '/company/drivers',
                icon: <CarOutlined />,
                label: 'Водители',
            });
        }
        if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            partnersChildren.push({
                key: '/company/users',
                icon: <TeamOutlined />,
                label: 'Сотрудники',
            });
        }
        partnersChildren.push({
            key: '/company/locations',
            icon: <PushpinOutlined />,
            label: 'Адреса',
        });

        if (partnersChildren.length > 0) {
            items.push({
                key: 'partners_group',
                icon: <TeamOutlined />,
                label: 'Организация',
                children: partnersChildren,
            });
        }

        // --- ФИНАНСЫ ---
        const financeChildren: any[] = [];
        if (hasPerm('documents')) {
            financeChildren.push({
                key: '/company/documents',
                icon: <FileOutlined />,
                label: 'Документы',
            });
        }
        if (hasPerm('accounting')) {
            financeChildren.push({
                key: '/company/accounting',
                icon: <DollarOutlined />,
                label: 'Бухгалтерия',
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
        <Layout style={{ minHeight: '100vh', background: '#f8f8f8' }}>
            {/* Mobile Drawer */}
            {isMobile && <MobileMenu />}

            {/* Top Header Navigation */}
            <Header
                className={isTrackingPage ? 'tracking-header' : ''}
                style={{
                    background: isTrackingPage ? 'rgba(255, 255, 255, 0.02)' : '#ffffff',
                    padding: '0 24px',
                    display: 'flex',
                    alignItems: 'center',
                    height: 56,
                    borderBottom: isTrackingPage ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e4e4e7',
                    position: isTrackingPage ? 'absolute' : 'sticky',
                    left: 0,
                    right: 0,
                    top: 0,
                    zIndex: 100,
                    boxShadow: isTrackingPage ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
                    backdropFilter: isTrackingPage ? 'blur(12px)' : 'none',
                    WebkitBackdropFilter: isTrackingPage ? 'blur(12px)' : 'none',
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
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginRight: 24, flexShrink: 0 }}
                    onClick={() => router.push('/company')}
                >
                    <div style={{
                        width: 30, height: 30, background: '#09090b', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>L</span>
                    </div>
                    {!isMobile && (
                        <Text strong className="logo-text" style={{ fontSize: 16, color: isTrackingPage ? undefined : '#09090b', fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
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
            <Layout style={{ background: isTrackingPage ? '#f8f8f8' : '#f8f8f8', padding: isTrackingPage ? 0 : (isMobile ? 0 : 24) }}>
                <Content
                    style={{
                        margin: isTrackingPage ? 0 : (isMobile ? 16 : 0),
                        padding: isTrackingPage ? 0 : (isMobile ? 16 : 32),
                        background: isTrackingPage ? 'transparent' : '#ffffff',
                        borderRadius: isTrackingPage ? 0 : 24,
                        border: isTrackingPage ? 'none' : '1px solid #e4e4e7',
                        minHeight: isTrackingPage ? '100vh' : 'calc(100vh - 56px - 48px)',
                        boxShadow: isTrackingPage ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.02)',
                        overflow: isTrackingPage ? 'hidden' : 'auto',
                    }}
                >
                    {children}
                </Content>
            </Layout>
        </Layout >
    );
}
