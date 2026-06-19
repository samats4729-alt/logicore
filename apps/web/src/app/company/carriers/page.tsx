'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';

export default function CarriersRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/company/partners?tab=carriers');
    }, [router]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <Spin size="large" />
        </div>
    );
}
