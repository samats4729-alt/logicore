'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    Banknote,
    Building2,
    Calculator,
    ChartColumn,
    Compass,
    CreditCard,
    FileText,
    Hourglass,
    LayoutDashboard,
    Settings,
    Truck,
    User as UserIcon,
    Users,
    Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import CompanySidebar, { type NavItem, type ProfileLink } from '@/components/company/CompanySidebar';
import CompanyTopbar, { type Crumb } from '@/components/company/CompanyTopbar';
import NotificationBell from '@/components/ui/NotificationBell';
import { VerificationBadge, useVerifiedToast, verificationNotice } from '@/components/company/Verification';
import type { CabinetNotice } from '@/components/company/SidebarNotices';
import { useTheme } from '@/components/ThemeProvider';
import AiButton from '@/components/ui/AiButton';
import { LiveEventTicker } from '@/components/ui/LiveTicker';
import GlobalSearch from '@/components/ui/GlobalSearch';
import UserAvatar from '@/components/UserAvatar';
import PaywallScreen from '@/components/PaywallScreen';
import NoSectionAccess from '@/components/ui/NoSectionAccess';
import { checkSectionAccess } from '@/lib/section-access';
import { BetaClosed, BetaStrip } from '@/components/ui/BetaNotice';
import { BETA_LABEL, betaStateOf, getBetaSection } from '@/lib/beta-sections';
import Loader from '@/components/ui/Loader';
import { isNavItemActive } from '@/lib/cabinet-nav';
import { ROLE_LABELS } from '@/lib/vocabulary';
import { exchangeStatus } from '@/lib/exchange';

/**
 * Название пункта меню с подписью «бета-тестирование».
 *
 * Подпись стоит рядом с названием, а не всплывает при наведении: на
 * телефоне наведения нет вовсе, а решение «идти сюда или нет» человек
 * принимает до нажатия.
 */
function MenuLabel({ label, href }: { label: string; href: string }) {
    const state = betaStateOf(href);
    if (!state) return <>{label}</>;
    return (
        <span>
            {label}
            <span className="lc-beta-tag">{BETA_LABEL}</span>
        </span>
    );
}

const AssistantWidget = dynamic(() => import('@/components/ui/AssistantWidget'), { ssr: false });

/** Иконка пункта меню — один размер на всё меню. */
const ic = (Icon: React.ComponentType<{ className?: string }>) => <Icon className="size-4" />;

/**
 * ИИ-гид просит открыть меню на телефоне (шаг тура ссылается на пункт меню).
 * Живёт внутри панели: открыть её можно только изнутри.
 */
function MobileMenuOpener() {
    const { setOpenMobile } = useSidebar();
    useEffect(() => {
        const open = () => setOpenMobile(true);
        window.addEventListener('logicore:open-mobile-menu', open);
        return () => window.removeEventListener('logicore:open-mobile-menu', open);
    }, [setOpenMobile]);
    return null;
}

/** Где я: раздел и, если открыт его пункт, сам пункт. */
function crumbsFor(items: NavItem[], pathname: string): Crumb[] {
    for (const item of items) {
        const sub = item.children?.find((c) => {
            const path = c.key.split('?')[0];
            return pathname === path || pathname.startsWith(path + '/');
        });
        const label = typeof item.label === 'string' ? item.label : '';
        if (sub) {
            const subLabel = typeof sub.label === 'string' ? sub.label : '';
            // Пункт, совпадающий с самим разделом («Обзор» у «Денег»), второй раз не пишем.
            if (sub.key === item.key) return [{ label }];
            return [{ label, href: item.key.startsWith('/') ? item.key : undefined }, { label: subLabel }];
        }
        if (isNavItemActive(item, pathname)) return [{ label }];
    }
    return [{ label: 'Кабинет' }];
}

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout, checkAuth, isLoading } = useAuthStore();

    const [hydrated, setHydrated] = useState(false);
    const [hasNewUpdates, setHasNewUpdates] = useState(false);
    const [billingStatus, setBillingStatus] = useState<any>(null);
    /* Состояние проверки организации. Нужно в двух местах разом: подсказка
       со следующим шагом в левом меню и отметка о подтверждении рядом с
       именем компании. */
    const [verification, setVerification] = useState<any>(null);
    const [auditEnabled, setAuditEnabled] = useState(false);
    /* Биржа строится в отдельной ветке и включается на сервере
       выключателем. Выключена — пункта в меню нет вовсе. */
    const [exchangeOn, setExchangeOn] = useState(false);
    /* Парк — компания-посредник для водителей без ИП. Сам не возит, поэтому
       у него свой кабинет: водители, их рейсы, приглашение — без заявок,
       биржи и денег перевозчика. Парк подтверждает владелец платформы. */
    const [isPark, setIsPark] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        if (!user?.companyId) return;
        api.get('/my-company')
            .then((res) => setVerification(res.data))
            .catch(() => setVerification(null));
    }, [user?.companyId]);
    useVerifiedToast(verification);

    useEffect(() => {
        if (!user?.companyId) return;
        let alive = true;
        exchangeStatus().then((st) => {
            if (!alive) return;
            setExchangeOn(st.enabled);
            setIsPark(st.enabled && st.isPark);
        });
        return () => { alive = false; };
    }, [user?.companyId]);

    useEffect(() => {
        const fetchPublishedUpdates = async () => {
            try {
                const res = await api.get('/assistant/updates/published');
                const publishedList = res.data || [];
                if (publishedList.length > 0) {
                    const latest = publishedList[0];
                    const stored = localStorage.getItem('lc_last_read_update_id');
                    if (stored !== latest.id) {
                        setHasNewUpdates(true);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch published updates', err);
            }
        };
        fetchPublishedUpdates();

        // Listen for user marking updates as read to clear top badge
        const handleUpdatesRead = () => {
            setHasNewUpdates(false);
        };
        window.addEventListener('logicore:updates-read', handleUpdatesRead);
        return () => window.removeEventListener('logicore:updates-read', handleUpdatesRead);
    }, []);

    // Статус подписки компании (пока биллинг выключен — ответ {enabled: false})
    useEffect(() => {
        if (!user?.companyId) return;
        api.get('/billing/status')
            .then((res) => setBillingStatus(res.data))
            .catch(() => setBillingStatus(null));
        api.get('/audit/status')
            .then((res) => setAuditEnabled(!!res.data.companiesEnabled))
            .catch(() => setAuditEnabled(false));
    }, [user?.companyId]);

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
            } else if (!currentUser.companyId && pathname !== '/company/onboarding') {
                // Пока организации нет, разделы кабинета всё равно отвечают
                // отказом — экраны показывали бы пустоту и ошибки. Раньше сюда
                // приводила только регистрация: вышел, зашёл снова — и попасть
                // на подключение организации было уже нечем.
                router.replace('/company/onboarding');
            }
        });
    }, [hydrated, checkAuth, router, logout, pathname]);

    useEffect(() => {
        if (isPark && pathname === '/company') router.replace('/company/park');
    }, [isPark, pathname, router]);

    if (!hydrated || isLoading || !user) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader size="large" />
            </div>
        );
    }

    const handleLogout = () => {
        logout();
        router.replace('/login');
    };

    const isAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user.role);
    const hasPerm = (perm: string) => isAdmin || !!user.permissions?.includes(perm);

    /**
     * Меню в зависимости от роли.
     *
     * Права те же, что были у верхних пилюль, — менялся только вид. Подпункты
     * разделов — ровно те страницы, что лежат на страницах-оглавлениях
     * («Деньги», «Отчёты», «Кабинет»), с теми же условиями показа.
     */
    const getMenuItems = (): NavItem[] => {
        const acc = hasPerm('accounting');

        // У парка своё меню: он сам не возит, заявки и деньги перевозчика ему не нужны.
        if (isPark) {
            return [
                { key: '/company/park', icon: ic(LayoutDashboard), label: 'Парк' },
                { key: '/company/park/drivers', icon: ic(Users), label: 'Водители' },
                { key: '/company/park/trips', icon: ic(Truck), label: 'Рейсы' },
                { key: '/company/park/payouts', icon: ic(Wallet), label: 'Выплаты' },
                { key: '/company/cabinet', icon: ic(Building2), label: 'Кабинет' },
            ];
        }

        const items: NavItem[] = [
            { key: '/company', icon: ic(LayoutDashboard), label: 'Дашборд' },
        ];

        // --- ЗАЯВКИ ---
        if (hasPerm('orders')) {
            items.push({
                key: '/company/orders',
                icon: ic(FileText),
                label: 'Заявки',
                children: [
                    { key: '/company/orders', label: 'Все заявки' },
                    { key: '/company/orders/create', label: 'Новая заявка' },
                    // Биржа — только если открыта на сервере и этой компании.
                    ...(exchangeOn ? [{ key: '/company/exchange', label: 'Биржа' }] : []),
                ],
            });
        }

        // --- ЗАПРОСЫ (этап до заявки: клиент спросил цену) ---
        if (hasPerm('orders')) {
            items.push({
                key: '/company/requests',
                icon: ic(Calculator),
                label: 'Запросы',
                children: [
                    { key: '/company/requests', label: 'Запросы на расчёт' },
                    { key: '/company/calculator', label: 'Калькулятор рейса' },
                ],
            });
        }

        // --- МОНИТОРИНГ ---
        // «Склад» переименован в «Очередь на погрузку»: учёта товара здесь
        // нет и не будет, а прежнее название его обещало.
        const monitoringChildren: NonNullable<NavItem['children']> = [];
        if (hasPerm('tracking')) {
            monitoringChildren.push({ key: '/company/tracking', label: 'Карта и GPS' });
        }
        if (user.role === 'WAREHOUSE_MANAGER' || isAdmin) {
            monitoringChildren.push({ key: '/company/warehouse', label: <MenuLabel label="Очередь на погрузку" href="/company/warehouse" /> });
        }
        if (monitoringChildren.length > 0) {
            items.push({ key: 'monitoring_group', icon: ic(Compass), label: 'Мониторинг', children: monitoringChildren });
        }

        // --- ДЕНЬГИ (ежедневная работа: документы, платежи, долги) ---
        // Право «Бухгалтерия»: руководитель снял галочку — раздела в меню нет.
        if (acc) {
            items.push({
                key: '/company/finance',
                icon: ic(Banknote),
                label: 'Деньги',
                children: [
                    { key: '/company/finance', label: 'Обзор' },
                    { key: '/company/accounting/invoices', label: 'Счета' },
                    { key: '/company/accounting/acts', label: 'Акты' },
                    { key: '/company/accounting/incoming', label: 'Входящие документы' },
                    { key: '/company/accounting/operations', label: 'Платежи' },
                    { key: '/company/accounting/calendar', label: 'Платёжный календарь' },
                    { key: '/company/accounting/counterparty-report', label: 'Долги и остатки' },
                    { key: '/company/inventory/balances', label: 'Материалы' },
                    ...(isAdmin ? [{ key: '/company/payroll', label: 'Зарплата' }] : []),
                ],
            });
        }

        // --- ОТЧЁТЫ (то, что смотрят раз в месяц) ---
        // Своё право, отдельно от «Бухгалтерии».
        if (hasPerm('reports')) {
            items.push({
                key: '/company/reports',
                icon: ic(ChartColumn),
                label: 'Отчёты',
                children: [
                    { key: '/company/accounting/pnl', label: 'Отчёт по прибыли' },
                    { key: '/company/accounting/carrier-profit', label: 'Прибыль по перевозчику' },
                    { key: '/company/accounting/registry', label: 'Реестр заявок' },
                    { key: '/company/accounting/cashflow', label: 'Движение денег' },
                    { key: '/company/accounting/expenses-by-category', label: 'Расходы по статьям' },
                ],
            });
        }

        // --- КАБИНЕТ (справочники, организация, сотрудники) ---
        // Пункты — с теми же условиями, что на странице «Кабинет»; остальные
        // справочники (банки, валюты, нумерация) — на самой странице.
        items.push({
            key: '/company/cabinet',
            icon: ic(Building2),
            label: 'Кабинет',
            children: [
                { key: '/company/cabinet', label: 'Все справочники' },
                ...(hasPerm('partners') ? [{ key: '/company/partners', label: 'Контрагенты' }] : []),
                ...(hasPerm('drivers') ? [{ key: '/company/drivers', label: 'Водители' }] : []),
                ...(isAdmin ? [{ key: '/company/vehicles', label: 'Автопарк' }] : []),
                { key: '/company/locations', label: 'Адреса и склады' },
                ...(hasPerm('partners') ? [{ key: '/company/contracts', label: 'Договоры' }] : []),
                ...(isAdmin ? [{ key: '/company/users', label: 'Сотрудники' }] : []),
                ...(hasPerm('documents') ? [{ key: '/company/documents', label: 'Документы' }] : []),
                ...(isAdmin && auditEnabled ? [{ key: '/company/audit', label: 'Журнал действий' }] : []),
            ],
        });

        return items;
    };

    const menuItems = getMenuItems();

    // Доступен ли текущий раздел этому человеку. Правило то же, что у меню.
    const sectionAccess = checkSectionAccess(pathname, user);

    // Готов ли раздел. Проверяем здесь, а не на каждой странице: по прямой
    // ссылке и из закладок человек приходит мимо меню.
    const beta = getBetaSection(pathname);

    /**
     * Меню профиля — внизу левой панели.
     *
     * «Что нового» и «Помощь» вынесены отдельными строками над профилем:
     * их ищут чаще, чем открывают профиль.
     */
    const profileLinks: ProfileLink[] = [
        { key: '/company/profile', label: 'Профиль', icon: <UserIcon />, onClick: () => router.push('/company/profile') },
        // «Моя зарплата» — личное, как профиль, и открыта каждому (владелец, 30.09.2026).
        { key: '/company/my-salary', label: 'Моя зарплата', icon: <Wallet />, onClick: () => router.push('/company/my-salary') },
        // «Подписка» — тем, кто платит; остальным там нечего нажать.
        ...(checkSectionAccess('/company/billing', user).allowed ? [{
            key: '/company/billing', label: 'Подписка', icon: <CreditCard />, onClick: () => router.push('/company/billing'),
        }] : []),
        // «Настройки» — реквизиты, печать и организации компании: их меняет руководитель.
        ...(checkSectionAccess('/company/settings', user).allowed ? [{
            key: '/company/settings', label: 'Настройки', icon: <Settings />, onClick: () => router.push('/company/settings'),
        }] : []),
    ];

    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();

    /* Важное по кабинету — карточками внизу левого меню, рядом с «Помощью»
       и «Что нового» (владелец, 08.10.2026). Раньше это были полосы над
       каждой страницей: занимали верх любого экрана, а относились к
       кабинету, а не к экрану. */
    const notices: CabinetNotice[] = [];
    const verificationHint = verificationNotice(verification);
    if (verificationHint) notices.push(verificationHint);
    // Бесплатные дни. Видят все сотрудники: закроется кабинет у всех сразу.
    if (billingStatus?.enabled && !billingStatus?.blocked && billingStatus?.trialEndsAt
        && ['TRIAL', 'GRACE'].includes(billingStatus?.status)) {
        const left = Math.max(0, Math.ceil((new Date(billingStatus.trialEndsAt).getTime() - Date.now()) / 86400000));
        notices.push({
            key: 'trial',
            tone: billingStatus.status === 'GRACE' || left <= 3 ? 'warn' : 'info',
            icon: Hourglass,
            title: `${billingStatus.status === 'GRACE' ? 'Оплатить подписку' : 'Пробный период'} до ${new Date(billingStatus.trialEndsAt).toLocaleDateString('ru-RU')}`,
            text: `Осталось ${left} дн.`,
            // Кнопка — тем, кто может оплатить; остальным там нечего нажать.
            action: checkSectionAccess('/company/billing', user).allowed ? { label: 'Подписка', href: '/company/billing' } : undefined,
        });
    }

    return (
        <SidebarProvider
            className="lc-nova"
            style={{ '--sidebar-width': '15rem', background: 'var(--nova-bg)' } as React.CSSProperties}
        >
            <MobileMenuOpener />
            <CompanySidebar
                items={menuItems}
                pathname={pathname}
                company={user.company?.name || 'LogiCore'}
                companyCaption={ROLE_LABELS[user.role] || user.role}
                companyBadge={<VerificationBadge data={verification} />}
                user={{
                    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '',
                    caption: user.email || '',
                    avatar: (
                        <UserAvatar
                            userId={user.id}
                            hasAvatar={!!(user as any).avatarPath}
                            size={32}
                            fallback={
                                <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-[12px] font-semibold">
                                    {initials || <UserIcon className="size-4" />}
                                </span>
                            }
                        />
                    ),
                }}
                profileLinks={profileLinks}
                hasNewUpdates={hasNewUpdates}
                notices={notices}
                // Своя страница, а не окно помощника: список нововведений читают целиком.
                onUpdates={() => router.push('/company/updates')}
                onSupport={() => router.push('/company/support')}
                onLogout={handleLogout}
            />

            <SidebarInset className="min-w-0" style={{ background: 'var(--nova-bg)' }}>
                <CompanyTopbar
                    crumbs={crumbsFor(menuItems, pathname)}
                    theme={theme === 'dark' ? 'dark' : 'light'}
                    onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                    attention={notices.length > 0}
                    tools={
                        <>
                            <AiButton />
                            <GlobalSearch />
                            <NotificationBell hasNewUpdates={hasNewUpdates} />
                        </>
                    }
                />

                {/* Тикер живых событий (глобальный) */}
                <LiveEventTicker />

                {/* Страница и ИИ-помощник рядом: открытая панель встаёт справа под
                    бегущей строкой и сдвигает страницу, а не ложится поверх. */}
                <div className="flex min-w-0 flex-1">
                    <main data-guide="content" className="page-content-anim min-w-0 flex-1">
                        {billingStatus?.enabled && billingStatus?.blocked ? (
                            <PaywallScreen status={billingStatus} />
                        ) : (
                            <>
                                {/* Прямая ссылка в чужой раздел — понятная причина
                                    вместо пустого экрана. Главным остаётся сервер. */}
                                {!sectionAccess.allowed ? (
                                    <NoSectionAccess title={sectionAccess.title} roleLabel={ROLE_LABELS[user.role] || user.role} />
                                ) : beta?.state === 'closed' ? (
                                    <BetaClosed section={beta} />
                                ) : (
                                    <>
                                        {beta?.state === 'beta' && <BetaStrip section={beta} />}
                                        {children}
                                    </>
                                )}
                            </>
                        )}
                    </main>
                    <AssistantWidget />
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
