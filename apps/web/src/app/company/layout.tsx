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
    MenuFoldOutlined,
    MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout, checkAuth, isLoading } = useAuthStore();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Определяем мобильное устройство
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        checkAuth().then(() => {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser) {
                router.replace('/login');
            } else if (!['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER'].includes(currentUser.role)) {
                if (currentUser.role === 'ADMIN') {
                    router.replace('/admin');
                } else if (currentUser.role === 'FORWARDER') {
                    router.replace('/forwarder');
                } else {
                    router.replace('/login');
                }
            } else if (currentUser.role === 'LOGISTICIAN' && currentUser.company?.type === 'FORWARDER') {
                // Если это логист экспедитора - редирект на /forwarder
                router.replace('/forwarder');
            }
        });
    }, [checkAuth, router]);

    if (isLoading || !user) {
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
        const items = [
            {
                key: '/company',
                icon: <DashboardOutlined />,
                label: 'Дашборд',
            },
            {
                key: '/company/orders',
                icon: <FileTextOutlined />,
                label: 'Заявки',
            },
            {
                key: '/company/partners',
                icon: <TeamOutlined />,
                label: 'Партнеры',
            },
            {
                key: '/company/locations',
                icon: <PushpinOutlined />,
                label: 'Адреса',
            },
        ];

        // Для завсклада — очередь на погрузку
        if (user.role === 'WAREHOUSE_MANAGER' || user.role === 'COMPANY_ADMIN') {
            items.push({
                key: '/company/warehouse',
                icon: <InboxOutlined />,
                label: 'Очередь погрузки',
            });
        }

        // Карта для всех
        items.push({
            key: '/company/tracking',
            icon: <EnvironmentOutlined />,
            label: 'Карта',
        });

        // Управление пользователями — только для админа компании
        if (user.role === 'COMPANY_ADMIN') {
            items.push({
                key: '/company/users',
                icon: <TeamOutlined />,
                label: 'Пользователи',
            });
        }

        // Документы и Настройки для всех
        items.push(
            {
                key: '/company/documents',
                icon: <FileOutlined />,
                label: 'Документы',
            },
            {
                key: '/company/settings',
                icon: <SettingOutlined />,
                label: 'Настройки',
            }
        );

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
        <Layout style={{ minHeight: '100vh', background: '#f8f8f8' }}> {/* Subtle gray background for the whole app base */}
            {/* Desktop Sidebar */}
            {!isMobile && (
                <Sider
                    collapsible
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    trigger={null}
                    theme="light"
                    width={260}
                    style={{
                        borderRight: 'none',
                        background: '#f8f8f8', /* Match app base */
                        position: 'sticky',
                        top: 0,
                        height: '100vh',
                        left: 0,
                        zIndex: 10,
                    }}
                >
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
                            <div style={{ padding: '24px 20px', marginBottom: 8 }}>
                                {!collapsed ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 32, height: 32, background: '#09090b', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>L</span>
                                        </div>
                                        <Text strong style={{ fontSize: 18, color: '#09090b', fontWeight: 700, letterSpacing: '-0.02em' }}>
                                            {user.company?.name || 'LogiCore'}
                                        </Text>
                                    </div>
                                ) : (
                                    <div style={{ width: 32, height: 32, background: '#09090b', borderRadius: 8, margin: '0 auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                                )}
                            </div>
                            <Menu
                                mode="inline"
                                selectedKeys={[pathname]}
                                items={getMenuItems()}
                                onClick={({ key }) => router.push(key)}
                                style={{ borderRight: 'none', background: 'transparent', padding: '0 12px' }}
                                className="premium-menu"
                            />
                        </div>

                        {/* User Profile */}
                        <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
                            <Dropdown menu={userMenu} placement="topLeft" trigger={['click']}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    cursor: 'pointer',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    transition: 'background 0.2s',
                                    marginTop: 16
                                }}
                                    className="user-profile-trigger"
                                >
                                    <Avatar
                                        icon={<UserOutlined />}
                                        size="default"
                                        style={{ background: '#ffffff', color: '#09090b', border: '1px solid #e4e4e7', flexShrink: 0 }}
                                    />
                                    {!collapsed && (
                                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                            <Text strong style={{ fontSize: 14, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                                                {user.firstName} {user.lastName}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.2 }}>Клиент</Text>
                                        </div>
                                    )}
                                </div>
                            </Dropdown>
                        </div>

                        {/* Custom Collapse Toggle at Footer */}
                        <div
                            onClick={() => setCollapsed(!collapsed)}
                            className="sidebar-toggle-btn"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: collapsed ? 'center' : 'flex-start',
                                padding: '16px',
                                cursor: 'pointer',
                                color: '#71717a',
                                fontSize: 16,
                                transition: 'all 0.2s',
                                borderTop: '1px solid #f4f4f5',
                                height: 48,
                            }}
                        >
                            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            {!collapsed && <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 500 }}>Свернуть меню</span>}
                        </div>
                    </div>
                </Sider>
            )
            }

            {/* Mobile Drawer */}
            {isMobile && <MobileMenu />}

            <Layout style={{ background: '#f8f8f8', padding: isMobile ? 0 : '24px 24px 24px 0' }}>
                {/* Mobile Header */}
                {isMobile && (
                    <Header
                        style={{
                            background: '#f8f8f8',
                            padding: '0 16px',
                            display: 'flex',
                            alignItems: 'center',
                            height: 64,
                            border: 'none'
                        }}
                    >
                        <Button
                            type="text"
                            icon={<MenuOutlined />}
                            onClick={() => setMobileMenuOpen(true)}
                        />
                        <span style={{ fontWeight: 600, marginLeft: 12 }}>{user.company?.name}</span>
                    </Header>
                )}

                <Content
                    style={{
                        margin: isMobile ? '16px' : 0,
                        padding: isMobile ? 16 : 32,
                        background: '#ffffff',
                        borderRadius: 24,
                        border: '1px solid #e4e4e7',
                        minHeight: 280,
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)',
                        overflow: 'auto',
                        height: '100%',
                        marginLeft: 0,
                    }}
                >
                    {children}
                </Content>
            </Layout>
        </Layout >
    );
}
