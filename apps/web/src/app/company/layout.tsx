'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Button, Avatar, Dropdown, Typography, Spin } from 'antd';
import {
    DashboardOutlined,
    FileTextOutlined,
    TeamOutlined,
    EnvironmentOutlined,
    LogoutOutlined,
    UserOutlined,
    InboxOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout, checkAuth, isLoading } = useAuthStore();
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        checkAuth().then(() => {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser) {
                router.replace('/login');
            } else if (!['COMPANY_ADMIN', 'LOGISTICIAN', 'WAREHOUSE_MANAGER'].includes(currentUser.role)) {
                if (currentUser.role === 'ADMIN') {
                    router.replace('/admin');
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

    return (
        <Layout style={{ minHeight: '100vh' }}>
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
            <Layout>
                <Header
                    style={{
                        background: '#fff',
                        padding: '0 24px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid #f0f0f0',
                    }}
                >
                    <Text strong>Кабинет клиента</Text>
                    <Dropdown menu={userMenu} placement="bottomRight">
                        <Button type="text" style={{ height: 'auto' }}>
                            <Avatar icon={<UserOutlined />} style={{ marginRight: 8 }} />
                            {user.firstName} {user.lastName}
                        </Button>
                    </Dropdown>
                </Header>
                <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8 }}>
                    {children}
                </Content>
            </Layout>
        </Layout>
    );
}
