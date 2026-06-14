'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';

export default function ForwarderDriversRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/company/users?segment=drivers');
    }, [router]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <Spin size="large" tip="Перенаправление..." />
        </div>
    );
}
