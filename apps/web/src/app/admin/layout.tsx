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
    message,
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
    GlobalOutlined,
    CustomerServiceOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
    { key: '/admin', icon: <DashboardOutlined />, label: 'Дашборд' },
    { key: '/admin/users', icon: <TeamOutlined />, label: 'Пользователи' },
    { key: '/admin/support', icon: <CustomerServiceOutlined />, label: 'Поддержка' },
    { key: '/admin/locations', icon: <GlobalOutlined />, label: 'География' },
    { key: '/admin/settings', icon: <SettingOutlined />, label: 'Настройки' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isTrackingPage = pathname === '/admin/tracking';
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

    const [hydrated, setHydrated] = useState(false);

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
        const init = async () => {
            await checkAuth();
            setLoading(false);
        };
        init();
    }, [hydrated, checkAuth]);

    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            // Not logged in -> Go to Admin Login
            router.push('/admin/login');
        } else if (user?.role !== 'ADMIN') {
            // Logged in but not Admin -> Kick out
            message.error('У вас нет прав администратора');
            router.push('/'); // Or access-denied
        }
    }, [loading, isAuthenticated, user, router]);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const handleMenuClick = (key: string) => {
        router.push(key);
        setMobileMenuOpen(false);
    };

    if (!hydrated || loading) {
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
                transition: 'all 0.2s',
                position: 'relative'
            }}>
                <Header
                    className={isTrackingPage ? 'tracking-header' : ''}
                    style={{
                        padding: isMobile ? '0 12px' : '0 24px',
                        background: isTrackingPage ? 'rgba(255, 255, 255, 0.005)' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: isTrackingPage ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                        boxShadow: isTrackingPage ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
                        position: isTrackingPage ? 'absolute' : 'sticky',
                        left: 0,
                        right: 0,
                        top: 0,
                        zIndex: 99,
                        backdropFilter: isTrackingPage ? 'blur(12px)' : 'none',
                        WebkitBackdropFilter: isTrackingPage ? 'blur(12px)' : 'none',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {isMobile ? (
                            <Button
                                type="text"
                                icon={<MenuOutlined />}
                                onClick={() => setMobileMenuOpen(true)}
                                style={{ color: isTrackingPage ? 'inherit' : undefined }}
                            />
                        ) : (
                            <div
                                onClick={() => setCollapsed(!collapsed)}
                                className="sidebar-toggle-btn"
                                style={{ fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8 }}
                            >
                                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            </div>
                        )}
                        {isMobile && (
                            <Text strong style={{ color: '#1677ff' }}>LogiCore</Text>
                        )}
                    </div>

                    <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                        <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} className="user-profile-trigger">
                            <Avatar icon={<UserOutlined />} size={isMobile ? 'small' : 'default'} />
                            {!isMobile && <Text style={{ color: isTrackingPage ? 'inherit' : undefined }}>{user?.firstName} {user?.lastName}</Text>}
                        </div>
                    </Dropdown>
                </Header>

                <Content style={{
                    margin: isTrackingPage ? 0 : (isMobile ? 8 : 24),
                    padding: isTrackingPage ? 0 : (isMobile ? 12 : 24),
                    background: isTrackingPage ? 'transparent' : '#fff',
                    borderRadius: isTrackingPage ? 0 : 8,
                    minHeight: isTrackingPage ? '100vh' : 'calc(100vh - 64px - 48px)',
                    overflow: isTrackingPage ? 'hidden' : 'auto',
                }}>
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
}
