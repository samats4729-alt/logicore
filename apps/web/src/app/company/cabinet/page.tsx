'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Building2,
    ChevronRight,
    ClipboardList,
    Contact,
    FileText,
    History,
    KeyRound,
    MapPin,
    ShieldCheck,
    Truck,
    UserCircle,
    Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import styles from '@/components/nova/nova.module.css';

/**
 * Кабинет — оглавление всего, что настраивают редко: организации,
 * сотрудники, справочники, профиль.
 *
 * Собран так же, как «Финансы»: разделы карточками, у каждого пункта
 * подпись, зачем он. Раньше это был список голых ссылок, и по названиям
 * вроде «Адреса» и «Договоры» приходилось угадывать, что внутри.
 */

type Link = {
    label: string;
    desc: string;
    href: string;
    icon: LucideIcon;
    show: boolean;
};

export default function CabinetPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [auditEnabled, setAuditEnabled] = useState(false);

    const isAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    const hasPerm = (perm: string) => isAdmin || (user?.permissions || []).includes(perm);

    useEffect(() => {
        api.get('/audit/status')
            .then(res => setAuditEnabled(!!res.data?.companiesEnabled))
            .catch(() => setAuditEnabled(false));
    }, []);

    const groups: { title: string; icon: LucideIcon; links: Link[] }[] = [
        {
            title: 'Организация',
            icon: Building2,
            links: [
                { label: 'Организации', desc: 'Реквизиты, подписи, печать', href: '/company/settings', icon: Building2, show: isAdmin },
            ],
        },
        {
            title: 'Сотрудники',
            icon: Users,
            links: [
                { label: 'Список сотрудников', desc: 'Кто работает в компании', href: '/company/users', icon: Users, show: isAdmin },
                { label: 'Права доступа', desc: 'Кому какие разделы видны', href: '/company/users?rights=1', icon: ShieldCheck, show: isAdmin },
                { label: 'Водители', desc: 'Люди за рулём и их документы', href: '/company/users?segment=drivers', icon: Contact, show: isAdmin },
            ],
        },
        {
            title: 'Справочники',
            icon: ClipboardList,
            links: [
                { label: 'Контрагенты', desc: 'Заказчики и перевозчики', href: '/company/partners', icon: Building2, show: hasPerm('partners') },
                { label: 'Договоры', desc: 'Условия работы с контрагентами', href: '/company/contracts', icon: FileText, show: hasPerm('partners') },
                { label: 'Адреса', desc: 'Точки погрузки и выгрузки', href: '/company/locations', icon: MapPin, show: true },
                { label: 'Автопарк', desc: 'Машины и прицепы компании', href: '/company/vehicles', icon: Truck, show: isAdmin },
                { label: 'Документы', desc: 'Файлы по рейсам и контрагентам', href: '/company/documents', icon: FileText, show: hasPerm('documents') },
            ],
        },
        {
            title: 'Аккаунт',
            icon: UserCircle,
            links: [
                { label: 'Мой профиль', desc: 'Имя, телефон, фотография', href: '/company/profile', icon: UserCircle, show: true },
                { label: 'Изменить пароль', desc: 'Смена пароля от входа', href: '/company/profile', icon: KeyRound, show: true },
            ],
        },
        {
            title: 'Журнал и контроль',
            icon: History,
            links: [
                { label: 'Журнал действий', desc: 'Кто и что менял в системе', href: '/company/audit', icon: History, show: isAdmin && auditEnabled },
            ],
        },
    ]
        .map(g => ({ ...g, links: g.links.filter(l => l.show) }))
        .filter(g => g.links.length > 0);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет</div>
                    <h1 className={styles.title}>Управление компанией</h1>
                    <p className={styles.subtitle}>
                        Организации, сотрудники и справочники — всё, что настраивают один раз
                        и потом редко трогают.
                    </p>
                </div>
            </div>

            {groups.length === 0 ? (
                <div className={styles.empty}>Здесь пока нечего настраивать — у вашей роли нет доступа к этим разделам.</div>
            ) : (
                <div className={styles.columns}>
                    {groups.map(group => (
                        <section className={styles.card} key={group.title}>
                            <div className={styles.cardHead}>
                                <group.icon size={14} />
                                <h2 className={styles.cardTitle}>{group.title}</h2>
                                <span className={styles.cardCount}>{group.links.length}</span>
                            </div>
                            <div className={styles.list}>
                                {group.links.map(link => (
                                    <button
                                        type="button"
                                        key={link.label}
                                        className={styles.item}
                                        onClick={() => router.push(link.href)}
                                    >
                                        <span className={styles.itemIcon}><link.icon size={16} /></span>
                                        <span className={styles.itemText}>
                                            <span className={styles.itemLabel}>{link.label}</span>
                                            <span className={styles.itemDesc}>{link.desc}</span>
                                        </span>
                                        <ChevronRight size={14} className={styles.chevron} />
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
