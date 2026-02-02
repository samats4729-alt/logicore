'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Button, Avatar, Dropdown, Typography, Spin, Drawer } from 'antd';
import {
    DashboardOutlined,
    FileTextOutlined,
    LogoutOutlined,
    UserOutlined,
    MenuOutlined,
    TruckOutlined,
    TeamOutlined,
    EnvironmentOutlined,
    FileOutlined,
    SettingOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function ForwarderLayout({ children }: { children: React.ReactNode }) {
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
            } else if (currentUser.role !== 'FORWARDER') {
                // Редирект на соответствующий кабинет
                if (currentUser.role === 'ADMIN') {
                    router.replace('/admin');
                } else if (currentUser.role === 'LOGISTICIAN') {
                    // Check if this logistician belongs to a FORWARDER company
                    if (currentUser.company?.type !== 'FORWARDER') {
                        router.replace('/company');
                    }
                    // If belongs to FORWARDER, allow access (do nothing)
                } else if (['COMPANY_ADMIN', 'WAREHOUSE_MANAGER'].includes(currentUser.role)) {
                    router.replace('/company');
                } else {
                    router.replace('/login');
                }
            } else {
                // User IS 'FORWARDER' role (Main forwarder account) - allow access
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

    const menuItems = [
        {
            key: '/forwarder',
            icon: <DashboardOutlined />,
            label: 'Дашборд',
        },
        {
            key: '/forwarder/search',
            icon: <SearchOutlined />,
            label: 'Поиск грузов',
        },
        {
            key: '/forwarder/orders',
            icon: <FileTextOutlined />,
            label: 'Входящие заявки',
        },
        {
            key: '/forwarder/drivers',
            icon: <TeamOutlined />,
            label: 'Водители',
        },
        {
            key: '/forwarder/partners',
            icon: <TeamOutlined />,
            label: 'Партнеры',
        },
        {
            key: '/forwarder/tracking',
            icon: <EnvironmentOutlined />,
            label: 'Карта',
        },
        {
            key: '/forwarder/documents',
            icon: <FileOutlined />,
            label: 'Документы',
        },
        {
            key: '/forwarder/settings',
            icon: <SettingOutlined />,
            label: 'Настройки',
        },
    ];

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
                items={menuItems}
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
                        background: '#f8f8f8',
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 12 }}>
                                        <div style={{ width: 32, height: 32, background: '#09090b', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>E</span>
                                        </div>
                                        <Text strong style={{ fontSize: 18, color: '#09090b', fontWeight: 700, letterSpacing: '-0.02em' }}>
                                            {user.company?.name || 'Экспедитор'}
                                        </Text>
                                    </div>
                                ) : (
                                    <div style={{ width: 32, height: 32, background: '#09090b', borderRadius: 8, margin: '0 auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                                )}
                            </div>
                            <Menu
                                mode="inline"
                                selectedKeys={[pathname]}
                                items={menuItems}
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
                                            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.2 }}>Экспедитор</Text>
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
