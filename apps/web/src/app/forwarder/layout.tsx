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
                } else if (['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER'].includes(currentUser.role)) {
                    router.replace('/company');
                } else {
                    router.replace('/login');
                }
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
        <Layout style={{ minHeight: '100vh' }}>
            {/* Desktop Sidebar */}
            {!isMobile && (
                <Sider
                    collapsible
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    theme="light"
                    style={{ borderRight: '1px solid #f0f0f0' }}
                >
                    <div style={{ padding: 16, textAlign: 'center' }}>
                        {!collapsed ? (
                            <Text strong style={{ fontSize: 16 }}>
                                {user.company?.name || 'Экспедитор'}
                            </Text>
                        ) : (
                            <TruckOutlined style={{ fontSize: 20 }} />
                        )}
                    </div>
                    <Menu
                        mode="inline"
                        selectedKeys={[pathname]}
                        items={menuItems}
                        onClick={({ key }) => router.push(key)}
                    />
                </Sider>
            )}

            {/* Mobile Drawer */}
            {isMobile && <MobileMenu />}

            <Layout>
                <Header
                    style={{
                        background: '#fff',
                        padding: isMobile ? '0 12px' : '0 24px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid #f0f0f0',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {isMobile && (
                            <Button
                                type="text"
                                icon={<MenuOutlined />}
                                onClick={() => setMobileMenuOpen(true)}
                            />
                        )}
                        <Text strong style={{ fontSize: isMobile ? 14 : 16, color: '#52c41a' }}>
                            {isMobile ? (user.company?.name || 'Экспедитор') : 'Кабинет экспедитора'}
                        </Text>
                    </div>
                    <Dropdown menu={userMenu} placement="bottomRight">
                        <Button type="text" style={{ height: 'auto', padding: isMobile ? '4px 8px' : '4px 12px' }}>
                            <Avatar icon={<UserOutlined />} size={isMobile ? 'small' : 'default'} style={{ marginRight: 8, background: '#52c41a' }} />
                            {!isMobile && `${user.firstName} ${user.lastName}`}
                        </Button>
                    </Dropdown>
                </Header>
                <Content
                    style={{
                        margin: isMobile ? 8 : 24,
                        padding: isMobile ? 12 : 24,
                        background: '#fff',
                        borderRadius: 8,
                        overflow: 'auto'
                    }}
                >
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
}
