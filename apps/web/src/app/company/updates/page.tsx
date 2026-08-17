'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { loadOrReport } from '@/lib/load';
import nova from '@/components/nova/nova.module.css';
import styles from './updates.module.css';

/**
 * Что нового на платформе.
 *
 * Раньше обновления жили внутри ИИ-помощника: он вываливал их сообщением в
 * чат при открытии. Прочитать список целиком было негде, вернуться к нему —
 * тоже: чат уезжал вверх, и вчерашнее находилось только новым вопросом.
 *
 * И это не уведомление. Уведомление говорит «сделай что-то», а
 * нововведение — «мы поменяли вот это». Смешивать их в одном колокольчике
 * значит приучить не читать ни то ни другое.
 */

interface PlatformUpdate {
    id: string;
    title: string;
    description: string;
    publishedAt?: string | null;
    createdAt: string;
}

/**
 * «17 августа» — как в письме, а не как в отчёте.
 *
 * Год дописываем только к прошлым: в свежих записях он ничего не добавляет,
 * зато удлиняет строку у каждой.
 */
const longDate = (iso?: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
};

/** Обновления одного дня стоят вместе: за раз их выходит несколько. */
function groupByDay(list: PlatformUpdate[]) {
    const groups: { day: string; items: PlatformUpdate[] }[] = [];
    for (const item of list) {
        const day = longDate(item.publishedAt || item.createdAt);
        const last = groups[groups.length - 1];
        if (last && last.day === day) last.items.push(item);
        else groups.push({ day, items: [item] });
    }
    return groups;
}

export default function UpdatesPage() {
    const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadOrReport('что нового', () => api.get('/assistant/updates/published'))
            .then((res) => {
                const list: PlatformUpdate[] = res?.data || [];
                setUpdates(list);

                // Открыли страницу — значит прочитали. Метка та же, что у
                // колокольчика: иначе точка «есть новое» осталась бы гореть
                // после прочтения.
                if (list.length > 0) {
                    localStorage.setItem('lc_last_read_update_id', list[0].id);
                    window.dispatchEvent(new Event('logicore:updates-read'));
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const groups = groupByDay(updates);

    return (
        <div className={nova.page}>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Что нового</h1>
                    <p className={nova.subtitle}>
                        Что мы поменяли в платформе. Самое свежее сверху.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className={nova.empty}>Загружаем…</div>
            ) : updates.length === 0 ? (
                <div className={nova.empty}>
                    Пока ничего не выходило. Как только появится — напишем здесь.
                </div>
            ) : (
                <div className={styles.feed}>
                    {groups.map((group) => (
                        <section key={group.day} className={styles.group}>
                            <div className={styles.day}>{group.day}</div>
                            <div className={styles.items}>
                                {group.items.map((item) => (
                                    <article key={item.id} className={styles.item}>
                                        <span className={styles.mark}><Sparkles size={13} /></span>
                                        <div className={styles.body}>
                                            <h2 className={styles.title}>{item.title}</h2>
                                            <p className={styles.text}>{item.description}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
