'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Dropdown, Drawer } from 'antd';
import {
    DashboardOutlined,
    TeamOutlined,
    CarOutlined,
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
    NotificationOutlined,
    DollarOutlined,
    HistoryOutlined,
    CheckCircleOutlined,
    FolderOpenOutlined,
} from '@ant-design/icons';
import { Moon, Sun } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useTheme } from '@/components/ThemeProvider';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import { ROLE_LABELS } from '@/lib/vocabulary';
import shell from './admin-shell.module.css';

/**
 * Оболочка админки — рабочее место владельца платформы.
 *
 * Раскладка своя, а не готовая из Ant Design: та красила логотип синим,
 * держала белый фон значением в коде и про тёмную тему не знала вовсе.
 * Владелец переключал тему в кабинете, заходил сюда — и получал белый экран.
 * Теперь цвета берутся из общей палитры, и переключатель темы стоит в шапке,
 * как в кабинете.
 *
 * Меню осталось слева. В кабинете разделы стоят пилюлями наверху, но там их
 * шесть, а здесь четырнадцать: наверху они не помещаются, а прятать их в
 * «ещё» — значит спрятать половину работы.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isTrackingPage = pathname === '/admin/tracking';
    const { user, isAuthenticated, logout, checkAuth } = useAuthStore();
    const { theme, setTheme } = useTheme();
    const [collapsed, setCollapsed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [draftCount, setDraftCount] = useState(0);
    const [pendingCompanies, setPendingCompanies] = useState(0);

    // Разделы платформы: страницы были на месте и работали, но ссылок на них
    // в меню не было — попасть можно было только по прямому адресу, который
    // надо знать наизусть. Так пряталось и подтверждение новых организаций:
    // клиент отправлял документы и ждал, а владелец об этом не узнавал.
    const menuItems: { key: string; icon: React.ReactNode; label: string; count?: number }[] = [
        { key: '/admin', icon: <DashboardOutlined />, label: 'Дашборд' },
        {
            key: '/admin/companies',
            icon: <CheckCircleOutlined />,
            label: 'Проверка организаций',
            count: pendingCompanies,
        },
        { key: '/admin/users', icon: <TeamOutlined />, label: 'Пользователи' },
        { key: '/admin/orders', icon: <FileTextOutlined />, label: 'Заявки' },
        { key: '/admin/tracking', icon: <AimOutlined />, label: 'Мониторинг' },
        { key: '/admin/documents', icon: <FolderOpenOutlined />, label: 'Документы' },
        { key: '/admin/cargo-types', icon: <CarOutlined />, label: 'Виды груза' },
        { key: '/admin/support', icon: <CustomerServiceOutlined />, label: 'Поддержка' },
        {
            key: '/admin/updates',
            icon: <NotificationOutlined />,
            label: 'Нововведения',
            count: draftCount,
        },
        { key: '/admin/billing', icon: <DollarOutlined />, label: 'Биллинг' },
        { key: '/admin/audit', icon: <HistoryOutlined />, label: 'Журнал' },
        { key: '/admin/locations', icon: <GlobalOutlined />, label: 'География' },
        { key: '/admin/identity', icon: <TeamOutlined />, label: 'Личности' },
        { key: '/admin/settings', icon: <SettingOutlined />, label: 'Настройки' },
    ];

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
        if (!hydrated || loading || !isAuthenticated || user?.role !== 'ADMIN') return;
        const fetchDrafts = async () => {
            try {
                const res = await api.get('/assistant/updates?status=DRAFT');
                setDraftCount(res.data?.length || 0);
            } catch (err) {
                console.error('Failed to fetch draft updates count', err);
            }
        };
        fetchDrafts();
        const interval = setInterval(fetchDrafts, 60 * 1000);
        return () => clearInterval(interval);
    }, [hydrated, loading, isAuthenticated, user]);

    // Сколько организаций ждут проверки. Без этого числа заявка нового
    // клиента лежит незамеченной: он документы отправил, а увидеть это
    // можно было, только зайдя на страницу по прямому адресу.
    useEffect(() => {
        if (!hydrated || loading || !isAuthenticated || user?.role !== 'ADMIN') return;
        const fetchPending = async () => {
            try {
                const res = await api.get('/admin/company-verification', { params: { status: 'PENDING' } });
                setPendingCompanies(res.data?.length || 0);
            } catch (err) {
                console.error('Failed to fetch pending companies count', err);
            }
        };
        fetchPending();
        const interval = setInterval(fetchPending, 60 * 1000);
        return () => clearInterval(interval);
    }, [hydrated, loading, isAuthenticated, user]);

    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            // Not logged in -> Go to Admin Login
            router.push('/admin/login');
        } else if (user?.role !== 'ADMIN') {
            // Logged in but not Admin -> Kick out
            toast.error('У вас нет прав администратора');
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
            <div className={`lc-nova ${shell.center}`}>
                <Loader size="large" />
            </div>
        );
    }

    const userMenuItems = [
        { key: 'profile', icon: <UserOutlined />, label: 'Профиль' },
        { type: 'divider' as const },
        { key: 'logout', icon: <LogoutOutlined />, label: 'Выйти', onClick: handleLogout },
    ];

    /** Пункт меню. Свёрнутое меню оставляет значок, число садится на него уголком. */
    const NavItem = ({ item, compact }: { item: typeof menuItems[number]; compact: boolean }) => {
        const active = pathname === item.key;
        return (
            <button
                type="button"
                className={`${shell.item}${active ? ` ${shell.itemOn}` : ''}${compact ? ` ${shell.itemCollapsed}` : ''}`}
                onClick={() => handleMenuClick(item.key)}
                title={compact ? item.label : undefined}
            >
                <i>{item.icon}</i>
                {!compact && <span className={shell.itemText}>{item.label}</span>}
                {!!item.count && (
                    <span className={`${shell.badge}${compact ? ` ${shell.badgeDot}` : ''}`}>
                        {item.count}
                    </span>
                )}
            </button>
        );
    };

    return (
        <div className={`lc-nova ${shell.shell}`}>
            {!isMobile && (
                <aside className={`${shell.side}${collapsed ? ` ${shell.sideCollapsed}` : ''}`}>
                    <div className={shell.brand} onClick={() => router.push('/admin')}>
                        <span className={shell.brandMark}>{collapsed ? 'LC' : 'LogiCore'}</span>
                        {!collapsed && <span className={shell.brandKind}>админ</span>}
                    </div>
                    <nav className={shell.nav}>
                        {menuItems.map((item) => (
                            <NavItem key={item.key} item={item} compact={collapsed} />
                        ))}
                    </nav>
                </aside>
            )}

            {isMobile && (
                <Drawer
                    title="LogiCore · админ"
                    placement="left"
                    onClose={() => setMobileMenuOpen(false)}
                    open={mobileMenuOpen}
                    width={286}
                    className="lc-nova"
                    styles={{ body: { padding: 12 }, header: { background: 'var(--nova-surface-2)' } }}
                >
                    <nav className={shell.drawerNav}>
                        {menuItems.map((item) => (
                            <NavItem key={item.key} item={item} compact={false} />
                        ))}
                    </nav>
                    <div className={shell.drawerFoot}>
                        <button type="button" className={shell.drawerOut} onClick={handleLogout}>
                            <LogoutOutlined /> Выйти
                        </button>
                    </div>
                </Drawer>
            )}

            <div className={`${shell.main}${isMobile ? ` ${shell.mainBare}` : (collapsed ? ` ${shell.mainCollapsed}` : '')}`}>
                <header className={shell.head}>
                    <button
                        type="button"
                        className={shell.iconBtn}
                        onClick={() => (isMobile ? setMobileMenuOpen(true) : setCollapsed(!collapsed))}
                        aria-label="Меню"
                    >
                        {isMobile
                            ? <MenuOutlined />
                            : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
                    </button>
                    {isMobile && <span className={shell.brandMark}>LogiCore</span>}

                    <div className={shell.headSpacer} />

                    {/* Переключателя темы здесь не было вовсе: владелец выбирал
                        тёмную в кабинете, заходил в админку — и получал белый
                        экран. Теперь тот же выбор, что и в кабинете. */}
                    <button
                        type="button"
                        className={shell.iconBtn}
                        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                        title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                        aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                    >
                        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    </button>

                    <Dropdown
                        menu={{ items: userMenuItems }}
                        placement="bottomRight"
                        trigger={['click']}
                        overlayClassName="lc2-nav-drop"
                        transitionName=""
                    >
                        <div className={`${shell.profile} user-profile-trigger`}>
                            <span className={shell.profileAv}>
                                {((user?.firstName?.[0] || '') + (user?.lastName?.[0] || '')).toUpperCase()
                                    || <UserOutlined />}
                            </span>
                            {!isMobile && (
                                <span className={shell.profileWho}>
                                    <span className={shell.profileName}>
                                        {user?.firstName} {user?.lastName}
                                    </span>
                                    <span className={shell.profileRole}>
                                        {ROLE_LABELS[user?.role || ''] || 'Администратор'} · платформа
                                    </span>
                                </span>
                            )}
                        </div>
                    </Dropdown>
                </header>

                <main className={isTrackingPage ? shell.contentBare : shell.content}>
                    {children}
                </main>
            </div>
        </div>
    );
}
