'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { useAuthStore } from '@/store/auth';

export default function HomePage() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();

    useEffect(() => {
        if (isAuthenticated && user) {
            // Редирект на соответствующий дашборд по роли
            switch (user.role) {
                case 'ADMIN':
                    router.push('/admin');
                    break;
                case 'COMPANY_ADMIN':
                case 'LOGISTICIAN':
                    router.push('/company');
                    break;
                case 'WAREHOUSE_MANAGER':
                    router.push('/company/warehouse');
                    break;
                case 'DRIVER':
                    router.push('/driver');
                    break;
                case 'RECIPIENT':
                    router.push('/recipient');
                    break;
                default:
                    router.push('/company');
            }
        } else {
            router.push('/login');
        }
    }, [isAuthenticated, user, router]);

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <Spin size="large" tip="Загрузка..." />
        </div>
    );
}
