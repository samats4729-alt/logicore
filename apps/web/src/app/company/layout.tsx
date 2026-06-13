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
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Header, Content } = Layout;
const { Text } = Typography;

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
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
        router.push(key);
        setMobileMenuOpen(false);
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
            items.push({
                key: '/company/search',
                icon: <SearchOutlined />,
                label: 'Биржа грузов',
            });
        }



        if (hasPerm('partners')) {
            items.push({
                key: '/company/partners',
                icon: <TeamOutlined />,
                label: 'Контрагенты',
            });
            // Договоры обычно идут с партнерами или заявками
            items.push({
                key: '/company/contracts',
                icon: <FileTextOutlined />,
                label: 'Договоры',
            });
        }

        items.push({
            key: '/company/locations',
            icon: <PushpinOutlined />,
            label: 'Адреса',
        });

        // Для завсклада — очередь на погрузку
        if (user.role === 'WAREHOUSE_MANAGER' || ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            items.push({
                key: '/company/warehouse',
                icon: <InboxOutlined />,
                label: 'Очередь погрузки',
            });
        }

        if (hasPerm('tracking')) {
            items.push({
                key: '/company/tracking',
                icon: <EnvironmentOutlined />,
                label: 'Карта',
            });
        }

        // Управление пользователями — только для админа компании
        if (['COMPANY_ADMIN', 'FORWARDER'].includes(user.role)) {
            items.push({
                key: '/company/users',
                icon: <TeamOutlined />,
                label: 'Сотрудники',
            });
        }

        if (hasPerm('documents')) {
            items.push({
                key: '/company/documents',
                icon: <FileOutlined />,
                label: 'Документы',
            });
        }

        if (hasPerm('accounting')) {
            items.push({
                key: '/company/accounting',
                icon: <DollarOutlined />,
                label: 'Бухгалтерия',
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
                style={{
                    background: '#ffffff',
                    padding: '0 24px',
                    display: 'flex',
                    alignItems: 'center',
                    height: 56,
                    borderBottom: '1px solid #e4e4e7',
                    position: 'sticky',
                    top: 0,
                    zIndex: 100,
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
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
                        <Text strong style={{ fontSize: 16, color: '#09090b', fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
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
                        onClick={({ key }) => router.push(key)}
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
                            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                {user.firstName} {user.lastName}
                            </Text>
                        )}
                    </div>
                </Dropdown>
            </Header>

            {/* Content */}
            <Layout style={{ background: '#f8f8f8', padding: isMobile ? 0 : 24 }}>
                <Content
                    style={{
                        margin: isMobile ? 16 : 0,
                        padding: isMobile ? 16 : 32,
                        background: '#ffffff',
                        borderRadius: 24,
                        border: '1px solid #e4e4e7',
                        minHeight: 'calc(100vh - 56px - 48px)',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)',
                        overflow: 'auto',
                    }}
                >
                    {children}
                </Content>
            </Layout>
        </Layout >
    );
}
