'use client';

import { useMemo } from 'react';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { SWRConfig } from 'swr';
import ruRU from 'antd/locale/ru_RU';
import ThemeProvider, { useTheme } from '@/components/ThemeProvider';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '5010908858-q66i33df9kjpij46u5sevjb1ftl9lo2d.apps.googleusercontent.com';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function AntdConfig({ children }: { children: React.ReactNode }) {
    const { theme: currentTheme } = useTheme();

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
                        colorText: '#18181b',
                        colorTextSecondary: '#52525b',
                        colorTextTertiary: '#a1a1aa',
                        colorBorder: '#e4e4e7',
                        colorBorderSecondary: '#ececf0',
                        colorBgLayout: '#f6f7f9',
                        controlHeight: 32,
                    },
                    components: {
                        Button: {
                            fontWeight: 500,
                            borderRadius: 10,
                            controlHeight: 32,
                        },
                        Table: {
                            headerBg: '#fafafa',
                            headerColor: '#6b7280',
                            headerSplitColor: 'transparent',
                            rowHoverBg: '#f5f8ff',
                            cellPaddingBlock: 9,
                            borderColor: '#efeff2',
                        },
                        Card: {
                            borderRadiusLG: 16,
                            colorBorderSecondary: '#e8e9ee',
                        },
                        Modal: {
                            borderRadiusLG: 16,
                        },
                        Input: {
                            controlHeight: 32,
                            activeShadow: '0 0 0 3px rgba(22, 119, 255, 0.12)',
                        },
                        InputNumber: {
                            controlHeight: 32,
                        },
                        Select: {
                            controlHeight: 32,
                            borderRadiusLG: 12,
                        },
                        DatePicker: {
                            controlHeight: 32,
                        },
                        Menu: {
                            itemBorderRadius: 8,
                        },
                        Tag: {
                            borderRadiusSM: 6,
                        },
                        Dropdown: {
                            borderRadiusLG: 12,
                        },
                        Segmented: {
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
                    }}
                >
                    <AntdApp>{children}</AntdApp>
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