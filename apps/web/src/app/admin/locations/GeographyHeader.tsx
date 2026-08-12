'use client';

import { usePathname, useRouter } from 'next/navigation';
import nova from '@/components/nova/nova.module.css';

/**
 * Шапка справочника географии — одна на три страницы.
 *
 * Переключатель разделов был только на «Городах», а «Регионы» и «Страны»
 * открывались страницей без него: вернуться можно было лишь через боковое
 * меню. Раз это один справочник, и шапка у него одна.
 */

const TABS = [
    { key: '/admin/locations', label: 'Города' },
    { key: '/admin/locations/regions', label: 'Регионы' },
    { key: '/admin/locations/countries', label: 'Страны' },
];

export default function GeographyHeader({ actions }: { actions?: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();

    return (
        <>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Справочник</div>
                    <h1 className={nova.title}>География</h1>
                    <p className={nova.subtitle}>
                        Города, области и страны, из которых складываются маршруты. Список общий
                        на всю платформу: города отсюда подставляются в точки маршрута заявки.
                    </p>
                </div>
                {actions && <div className={nova.heroActions}>{actions}</div>}
            </div>

            <div className={nova.pills} style={{ marginBottom: 14 }} role="tablist">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={pathname === tab.key}
                        className={`${nova.pill} ${pathname === tab.key ? nova.pillActive : ''}`}
                        onClick={() => pathname !== tab.key && router.push(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </>
    );
}
