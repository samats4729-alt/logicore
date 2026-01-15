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
                        {!collapsed && (
                            <Text strong style={{ fontSize: 16 }}>
                                {user.company?.name || 'Компания'}
                            </Text>
                        )}
                    </div>
                    <Menu
                        mode="inline"
                        selectedKeys={[pathname]}
                        items={getMenuItems()}
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
                        <Text strong style={{ fontSize: isMobile ? 14 : 16 }}>
                            {isMobile ? (user.company?.name || 'LogiCore') : 'Кабинет клиента'}
                        </Text>
                    </div>
                    <Dropdown menu={userMenu} placement="bottomRight">
                        <Button type="text" style={{ height: 'auto', padding: isMobile ? '4px 8px' : '4px 12px' }}>
                            <Avatar icon={<UserOutlined />} size={isMobile ? 'small' : 'default'} style={{ marginRight: 8 }} />
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
