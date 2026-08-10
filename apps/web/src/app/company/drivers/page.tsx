'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Loader from '@/components/ui/Loader';

export default function ForwarderDriversRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/company/users?segment=drivers');
    }, [router]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <Loader size="large" tip="Перенаправление..." />
        </div>
    );
}
