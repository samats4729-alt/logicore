'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadForm } from '@/components/exchange/LoadForm';
import styles from '@/components/nova/nova.module.css';

export default function NewExchangeLoadPage() {
    const router = useRouter();
    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа · новый груз</div>
                    <h1 className={styles.title}>Поставить груз</h1>
                    <p className={styles.subtitle}>
                        Откуда, куда, что везём и за сколько. Водители увидят груз в приложении.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <Button variant="outline" onClick={() => router.push('/company/exchange')}>
                        <ArrowLeft className="h-4 w-4" /> К бирже
                    </Button>
                </div>
            </div>
            <LoadForm />
        </div>
    );
}
