'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    Layout,
    Menu,
    Avatar,
    Dropdown,
    Typography,
    Spin,
    Button,
    Drawer,
} from 'antd';
import {
    DashboardOutlined,
    TeamOutlined,
    CarOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    SettingOutlined,
    LogoutOutlined,
    UserOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    AimOutlined,
    MenuOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
    { key: '/admin', icon: <DashboardOutlined />, label: 'Дашборд' },
    { key: '/admin/orders', icon: <CarOutlined />, label: 'Заявки' },
    { key: '/admin/tracking', icon: <AimOutlined />, label: 'Отслеживание' },
    { key: '/admin/users', icon: <TeamOutlined />, label: 'Пользователи' },
    { key: '/admin/locations', icon: <EnvironmentOutlined />, label: 'Адреса' },
    { key: '/admin/documents', icon: <FileTextOutlined />, label: 'Документы' },
    { key: '/admin/settings', icon: <SettingOutlined />, label: 'Настройки' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, isAuthenticated, logout, checkAuth } = useAuthStore();
    const [collapsed, setCollapsed] = useState(false);
    const [loading, setLoading] = useState(true);
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
        const init = async () => {
            await checkAuth();
            setLoading(false);
        };
        init();
    }, [checkAuth]);

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            router.push('/login');
        }
    }, [loading, isAuthenticated, router]);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const handleMenuClick = (key: string) => {
        router.push(key);
        setMobileMenuOpen(false);
    };

    if (loading) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Spin size="large" />
            </div>
        );
    }

    const userMenuItems = [
        { key: 'profile', icon: <UserOutlined />, label: 'Профиль' },
        { type: 'divider' as const },
        { key: 'logout', icon: <LogoutOutlined />, label: 'Выйти', onClick: handleLogout },
    ];

    // Мобильное меню через Drawer
    const MobileMenu = () => (
        <Drawer
            title="LogiCore Admin"
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
                    trigger={null}
                    collapsible
                    collapsed={collapsed}
                    theme="light"
                    style={{
                        boxShadow: '2px 0 8px rgba(0,0,0,0.05)',
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        zIndex: 100,
                    }}
                >
                    <div style={{
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderBottom: '1px solid #f0f0f0',
                    }}>
                        <Text strong style={{ fontSize: collapsed ? 20 : 24, color: '#1677ff' }}>
                            {collapsed ? 'LC' : 'LogiCore'}
                        </Text>
                    </div>
                    <Menu
                        mode="inline"
                        selectedKeys={[pathname]}
                        items={menuItems}
                        onClick={({ key }) => router.push(key)}
                        style={{ borderRight: 0 }}
                    />
                </Sider>
            )}

            {/* Mobile Drawer */}
            {isMobile && <MobileMenu />}

            <Layout style={{
                marginLeft: isMobile ? 0 : (collapsed ? 80 : 200),
                transition: 'all 0.2s'
            }}>
                <Header style={{
                    padding: isMobile ? '0 12px' : '0 24px',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 99,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {isMobile ? (
                            <Button
                                type="text"
                                icon={<MenuOutlined />}
                                onClick={() => setMobileMenuOpen(true)}
                            />
                        ) : (
                            <div
                                onClick={() => setCollapsed(!collapsed)}
                                style={{ fontSize: 18, cursor: 'pointer' }}
                            >
                                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            </div>
                        )}
                        {isMobile && (
                            <Text strong style={{ color: '#1677ff' }}>LogiCore</Text>
                        )}
                    </div>

                    <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                        <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar icon={<UserOutlined />} size={isMobile ? 'small' : 'default'} />
                            {!isMobile && <Text>{user?.firstName} {user?.lastName}</Text>}
                        </div>
                    </Dropdown>
                </Header>

                <Content style={{
                    margin: isMobile ? 8 : 24,
                    padding: isMobile ? 12 : 24,
                    background: '#fff',
                    borderRadius: 8,
                    minHeight: 'calc(100vh - 64px - 48px)',
                    overflow: 'auto',
                }}>
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
}
