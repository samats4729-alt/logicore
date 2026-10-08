'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronsUpDown, LifeBuoy, LogOut, Megaphone } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarRail,
    useSidebar,
} from '@/components/ui/sidebar';
import { isNavItemActive } from '@/lib/cabinet-nav';
import { SidebarNotices, type CabinetNotice } from './SidebarNotices';

/**
 * Пункт меню кабинета.
 *
 * `key` — адрес страницы (или условный ключ группы без своей страницы, как
 * «Мониторинг»). По нему же ИИ-гид находит пункт: `data-menu-id` кончается
 * ключом, а список ключей сверяется с обвязкой кабинета проверкой.
 */
export interface NavItem {
    key: string;
    label: React.ReactNode;
    icon?: React.ReactNode;
    children?: NavSubItem[];
}

export interface NavSubItem {
    key: string;
    label: React.ReactNode;
}

export interface ProfileLink {
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    dot?: boolean;
}

/**
 * Цвет ссылок меню. Ant Design красит любую ссылку в синий, а синий в
 * кабинете значит «перейти по ссылке» — меню выглядело бы набором ссылок.
 */
const LINK = 'text-sidebar-foreground no-underline hover:text-sidebar-accent-foreground hover:no-underline';

/**
 * Буква в квадрате компании: из названия, без «ТОО», «ИП» и кавычек —
 * иначе у половины компаний стояла бы одна и та же «Т».
 */
function companyLetter(name: string): string {
    return (splitCompany(name).bare.charAt(0) || 'L').toUpperCase();
}

const LEGAL_FORM = /^(ТОО|ИП|АО|ООО|ОАО|ЗАО|LLP|LLC|TOO)\s+/i;

/** «ТОО «ЛогиКор Экспедиция»» → название «ЛогиКор Экспедиция» и форма «ТОО», как в макете. */
function splitCompany(name: string): { bare: string; form: string | null } {
    const form = name.match(LEGAL_FORM)?.[1] ?? null;
    const bare = name.replace(LEGAL_FORM, '').replace(/["«»“”`]/g, '').trim();
    return { bare: bare || name, form };
}

/** Подпункт выделен на своей странице и на её внутренних (карточка счёта внутри «Счетов»). */
function subActive(key: string, pathname: string): boolean {
    const path = key.split('?')[0];
    return pathname === path || pathname.startsWith(path + '/');
}

/**
 * Левое меню кабинета — по макету «LogiCore на shadcn Nova» (владелец, 07.10.2026).
 *
 * Раньше меню было пилюлями в верхней полосе: разделы-хабы открывали страницу
 * со списком ссылок, и до нужного экрана было два нажатия. Теперь у раздела
 * свои пункты прямо в меню, а нажатие на сам раздел по-прежнему ведёт на
 * его страницу-оглавление — привычный путь не пропал.
 *
 * Что показывать — решает обвязка кабинета (права, парк, биржа): сюда
 * приходит уже отобранный список.
 */
export default function CompanySidebar({
    items,
    pathname,
    company,
    companyCaption,
    companyBadge,
    user,
    profileLinks,
    hasNewUpdates,
    notices = [],
    onUpdates,
    onSupport,
    onLogout,
}: {
    items: NavItem[];
    pathname: string;
    company: string;
    companyCaption: string;
    companyBadge?: React.ReactNode;
    user: { name: string; caption: string; avatar: React.ReactNode };
    profileLinks: ProfileLink[];
    hasNewUpdates: boolean;
    /** Важное по кабинету — проверка организации, пробный период: карточкой над «Помощью». */
    notices?: CabinetNotice[];
    onUpdates: () => void;
    onSupport: () => void;
    onLogout: () => void;
}) {
    const { isMobile, setOpenMobile } = useSidebar();
    // На телефоне меню выезжает поверх страницы — после выбора пункта его закрываем.
    const closeOnMobile = () => { if (isMobile) setOpenMobile(false); };

    return (
        <Sidebar collapsible="offcanvas">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild tooltip={company}>
                            <Link href="/company" onClick={closeOnMobile} className={LINK}>
                                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-[13px] font-semibold text-sidebar-primary-foreground">
                                    {companyLetter(company)}
                                </div>
                                <div className="grid min-w-0 flex-1 text-left leading-tight">
                                    <span className="flex items-center gap-1 truncate text-[13px] font-semibold">
                                        <span className="truncate">{splitCompany(company).bare}</span>
                                        {companyBadge}
                                    </span>
                                    <span className="truncate text-[12px] text-muted-foreground">
                                        {[companyCaption, splitCompany(company).form].filter(Boolean).join(' · ')}
                                    </span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Разделы</SidebarGroupLabel>
                    <SidebarMenu>
                        {items.map((item) => (
                            <NavEntry key={item.key} item={item} pathname={pathname} onNavigate={closeOnMobile} />
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <SidebarNotices notices={notices} onNavigate={closeOnMobile} />
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="sm" tooltip="Помощь" onClick={() => { onSupport(); closeOnMobile(); }}>
                            <LifeBuoy />
                            <span>Помощь</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="sm" tooltip="Что нового" onClick={() => { onUpdates(); closeOnMobile(); }}>
                            <Megaphone />
                            <span>Что нового</span>
                            {hasNewUpdates && <span className="ml-auto size-1.5 rounded-full bg-destructive" aria-label="Есть новое" />}
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton
                                    size="lg"
                                    data-guide="profile"
                                    // Класс — якорь браузерных проверок «меню профиля» (my-salary и др.).
                                    className="user-profile-trigger data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">{user.avatar}</span>
                                    <div className="grid min-w-0 flex-1 text-left leading-tight">
                                        <span className="truncate text-[13px] font-semibold">{user.name}</span>
                                        <span className="truncate text-[12px] text-muted-foreground">{user.caption}</span>
                                    </div>
                                    <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                                side={isMobile ? 'bottom' : 'right'}
                                align="end"
                                sideOffset={4}
                            >
                                <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">{user.name}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {profileLinks.map((link) => (
                                    <DropdownMenuItem
                                        key={link.key}
                                        data-menu-id={`lc2-${link.key}`}
                                        onSelect={() => { link.onClick(); closeOnMobile(); }}
                                        className="text-[13px]"
                                    >
                                        {link.icon}
                                        {link.label}
                                        {link.dot && <span className="ml-auto size-1.5 rounded-full bg-destructive" />}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={onLogout} className="text-[13px]">
                                    <LogOut />
                                    Выйти
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}

/**
 * Один раздел меню.
 *
 * Раздел с подпунктами раскрывается стрелкой справа. Нажатие на само название
 * ведёт на страницу раздела, если она есть (у «Денег» и «Кабинета» это
 * оглавление), и раскрывает список; у «Мониторинга» своей страницы нет —
 * название только раскрывает.
 */
function NavEntry({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
    const active = isNavItemActive(item, pathname);
    const hasPage = item.key.startsWith('/');
    const [open, setOpen] = useState(active);

    // Перешли в раздел по ссылке со страницы — раскрываем его сами.
    useEffect(() => { if (active) setOpen(true); }, [active]);

    const label = typeof item.label === 'string' ? item.label : undefined;

    if (!item.children?.length) {
        return (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={active} tooltip={label}>
                    <Link href={item.key} data-menu-id={`lc2-${item.key}`} onClick={onNavigate} className={LINK}>
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
    }

    return (
        <Collapsible asChild open={open} onOpenChange={setOpen}>
            <SidebarMenuItem>
                {hasPage ? (
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                        <Link href={item.key} data-menu-id={`lc2-${item.key}`} onClick={() => { setOpen(true); onNavigate(); }} className={LINK}>
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    </SidebarMenuButton>
                ) : (
                    <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={active} tooltip={label} data-menu-id={`lc2-${item.key}`}>
                            {item.icon}
                            <span>{item.label}</span>
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                )}
                <CollapsibleTrigger asChild>
                    <SidebarMenuAction
                        className="text-muted-foreground transition-transform data-[state=open]:rotate-90"
                        aria-label={open ? 'Свернуть' : 'Развернуть'}
                    >
                        <ChevronRight />
                    </SidebarMenuAction>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {item.children.map((sub) => (
                            <SidebarMenuSubItem key={sub.key}>
                                <SidebarMenuSubButton asChild isActive={subActive(sub.key, pathname)}>
                                    <Link href={sub.key} data-menu-id={`lc2-${sub.key}`} onClick={onNavigate} className={LINK}>
                                        <span>{sub.label}</span>
                                    </Link>
                                </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    );
}
