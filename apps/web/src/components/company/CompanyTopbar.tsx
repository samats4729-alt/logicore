'use client';

import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

export interface Crumb {
    label: string;
    href?: string;
}

/**
 * Верхняя полоса кабинета: свернуть меню, где я нахожусь, и справа —
 * помощник, поиск, уведомления, тема.
 *
 * Сами помощник, поиск и колокольчик — прежние компоненты, приходят сюда
 * готовыми: менялась только раскладка полосы, не то, что они делают.
 */
export default function CompanyTopbar({
    crumbs,
    tools,
    theme,
    onToggleTheme,
}: {
    crumbs: Crumb[];
    tools: React.ReactNode;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}) {
    return (
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-0 border-b border-solid border-border bg-background px-4">
            <SidebarTrigger className="-ml-1 size-8 text-muted-foreground" aria-label="Свернуть или развернуть меню" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <Breadcrumb className="min-w-0">
                <BreadcrumbList className="flex-nowrap text-[13px]">
                    {crumbs.map((crumb, i) => {
                        const last = i === crumbs.length - 1;
                        return (
                            <span key={`${crumb.label}-${i}`} className="contents">
                                {i > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
                                <BreadcrumbItem className={last ? 'min-w-0' : 'hidden sm:inline-flex'}>
                                    {last || !crumb.href ? (
                                        <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                                    ) : (
                                        <BreadcrumbLink asChild>
                                            {/* Цвет явно: Ant Design красит любую ссылку синим. */}
                                            <Link href={crumb.href} className="text-muted-foreground hover:text-foreground">{crumb.label}</Link>
                                        </BreadcrumbLink>
                                    )}
                                </BreadcrumbItem>
                            </span>
                        );
                    })}
                </BreadcrumbList>
            </Breadcrumb>

            <div className="ml-auto flex items-center gap-1.5">
                {tools}
                <button
                    type="button"
                    className="nova-iconbtn"
                    onClick={onToggleTheme}
                    title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                    aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                >
                    {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
            </div>
        </header>
    );
}
