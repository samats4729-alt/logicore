'use client';

import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Всплывающие уведомления — замена `message` из antd.
 *
 * Отличие от кода с ui.shadcn.com: вместо `next-themes` берём тему из
 * нашего `ThemeProvider`. Переключатель темы в проекте уже свой (он ставит
 * `data-theme` на `<html>` и запоминает выбор в `lc_theme`), и next-themes
 * про него ничего не знает — уведомления жили бы своей темой, отдельной от
 * остального приложения.
 */
const Toaster = ({ ...props }: ToasterProps) => {
    const { theme } = useTheme();

    return (
        <Sonner
            theme={theme}
            position="top-right"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast:
                        'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lift group-[.toaster]:rounded-xl',
                    description: 'group-[.toast]:text-muted-foreground',
                    actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
                    cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
