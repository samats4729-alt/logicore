'use client';

import { useMemo } from 'react';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { SWRConfig } from 'swr';
import ruRU from 'antd/locale/ru_RU';
import ThemeProvider, { useTheme } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { reportRequestFailure } from '@/lib/load';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '5010908858-q66i33df9kjpij46u5sevjb1ftl9lo2d.apps.googleusercontent.com';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Основной текст полей, списков и таблиц — 13 точек.
 *
 * Компактный режим antd считает шрифт от уменьшенного размера, и на старых
 * экранах поля, выпадающие списки, даты, ячейки таблиц и страницы таблиц
 * выходили 10-точечными — мельче, чем допускают правила интерфейса (11 —
 * предел, основной текст — 13). Высоты полей от этого не меняются: их
 * держит controlHeight. Задаём размер по компонентам, а не всей теме:
 * компактные отступы при этом остаются, а текст читается.
 */
const TEXT = { fontSize: 13 } as const;

function AntdConfig({ children }: { children: React.ReactNode }) {
    const { theme: currentTheme } = useTheme();
    const isDark = currentTheme === 'dark';

    const algorithm = useMemo(() => {
        if (currentTheme === 'dark') return [theme.darkAlgorithm, theme.compactAlgorithm];
        return [theme.defaultAlgorithm, theme.compactAlgorithm];
    }, [currentTheme]);

    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <ConfigProvider
                locale={ruRU}
                theme={{
                    algorithm,
                    token: {
                        colorPrimary: '#1677ff',
                        colorInfo: '#1677ff',
                        borderRadius: 10,
                        fontFamily: FONT_STACK,
                        fontSize: 13,
                        controlHeight: 32,
                        // Нейтральные цвета — только для светлой темы; в тёмной их даёт darkAlgorithm
                        ...(isDark ? {} : {
                            colorText: '#18181b',
                            colorTextSecondary: '#52525b',
                            colorTextTertiary: '#a1a1aa',
                            colorBorder: '#e4e4e7',
                            colorBorderSecondary: '#ececf0',
                            colorBgLayout: '#f6f7f9',
                        }),
                    },
                    components: {
                        Button: {
                            fontWeight: 500,
                            borderRadius: 10,
                            controlHeight: 32,
                            contentFontSize: 13,
                            contentFontSizeSM: 12,
                        },
                        Table: {
                            ...TEXT,
                            headerSplitColor: 'transparent',
                            cellPaddingBlock: 9,
                            // Светлые цвета шапки и строк — только для светлой темы. Были
                            // заданы для обеих, и в тёмной шапка таблицы оставалась почти
                            // белой полосой поперёк тёмной страницы.
                            ...(isDark ? {} : {
                                headerBg: '#fafafa',
                                headerColor: '#6b7280',
                                rowHoverBg: '#f6f7f9',
                                borderColor: '#efeff2',
                            }),
                        },
                        Card: {
                            borderRadiusLG: 16,
                            colorBorderSecondary: '#e8e9ee',
                        },
                        Modal: {
                            ...TEXT,
                            borderRadiusLG: 16,
                        },
                        Input: {
                            ...TEXT,
                            controlHeight: 32,
                            activeShadow: '0 0 0 3px rgba(22, 119, 255, 0.12)',
                        },
                        InputNumber: {
                            ...TEXT,
                            controlHeight: 32,
                        },
                        Select: {
                            ...TEXT,
                            controlHeight: 32,
                            borderRadiusLG: 12,
                        },
                        DatePicker: {
                            ...TEXT,
                            controlHeight: 32,
                        },
                        Pagination: TEXT,
                        Checkbox: TEXT,
                        Radio: TEXT,
                        Empty: TEXT,
                        Form: TEXT,
                        Descriptions: TEXT,
                        List: TEXT,
                        Upload: TEXT,
                        Alert: TEXT,
                        // Корень бейджа держит то, что он обнимает: подпись вкладки со
                        // счётчиком иначе выходила 10-точечной рядом с 13-точечными.
                        Badge: TEXT,
                        Typography: TEXT,
                        Menu: {
                            itemBorderRadius: 8,
                        },
                        Tag: {
                            borderRadiusSM: 6,
                            fontSizeSM: 12,
                        },
                        Dropdown: {
                            borderRadiusLG: 12,
                        },
                        Segmented: {
                            ...TEXT,
                            borderRadius: 10,
                        },
                        Tabs: {
                            titleFontSize: 14,
                        },
                    },
                }}
            >
                <SWRConfig
                    value={{
                        revalidateOnFocus: false,
                        revalidateOnReconnect: true,
                        dedupingInterval: 4000,
                        // Упавшая загрузка не должна выглядеть как «данных нет».
                        // Экраны на SWR молча показывали пустую таблицу: список
                        // не пришёл, а человек видел «Нет данных» и верил. Здесь
                        // одно место на весь кабинет — не придётся вспоминать
                        // про обработку ошибки на каждом новом экране.
                        onError: (error) => reportRequestFailure(error),
                    }}
                >
                    <AntdApp>
                        {children}
                        {/* Уведомления — sonner, а не message из antd. Внизу справа, как в
                            макете «shadcn Nova» (владелец, 08.10.2026): сверху они закрывали
                            кнопки шапки. Крестик — чтобы убрать, не дожидаясь. */}
                        <Toaster position="bottom-right" closeButton />
                    </AntdApp>
                </SWRConfig>
            </ConfigProvider>
        </GoogleOAuthProvider>
    );
}

export function AntdProvider({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <AntdConfig>{children}</AntdConfig>
        </ThemeProvider>
    );
}