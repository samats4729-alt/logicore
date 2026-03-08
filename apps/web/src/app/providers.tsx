'use client';

import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { GoogleOAuthProvider } from '@react-oauth/google';
import ruRU from 'antd/locale/ru_RU';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '5010908858-q66i33df9kjpij46u5sevjb1ftl9lo2d.apps.googleusercontent.com';

export function AntdProvider({ children }: { children: React.ReactNode }) {
    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <ConfigProvider
                locale={ruRU}
                theme={{
                    algorithm: theme.defaultAlgorithm,
                    token: {
                        colorPrimary: '#1677ff',
                        borderRadius: 8,
                    },
                }}
            >
                <AntdApp>{children}</AntdApp>
            </ConfigProvider>
        </GoogleOAuthProvider>
    );
}
