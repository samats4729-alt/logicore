'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Loader from '@/components/ui/Loader';

export default function CarriersRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/company/partners?tab=carriers');
    }, [router]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <Loader size="large" />
        </div>
    );
}
