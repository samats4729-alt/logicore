'use client';

import { useCallback, useEffect, useState } from 'react';
import { EnvironmentOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import styles from './missing-coordinates.module.css';

/**
 * Адреса, у которых нет точки на карте.
 *
 * Адрес теперь сохраняется и без координат — иначе при выключенном
 * геокодере нельзя завести адрес, а значит и оформить рейс. Но такой адрес
 * молчит: маршрут по нему не построится, а понять это можно только когда
 * рейс уже нужен. Здесь видно, сколько их накопилось, и можно попросить
 * поискать прямо сейчас, не дожидаясь фонового прохода.
 *
 * Отдельная строка — про ненайденные. Мынарал может не отдаться и рабочему
 * ключу; такие адреса ждут не запросов, а человека с картой.
 */

interface MissingItem {
    id: string;
    name: string;
    address: string;
    city?: string | null;
    country?: string | null;
    region?: string | null;
    street?: string | null;
    house?: string | null;
    geocodeFailedAt?: string | null;
}

interface MissingResponse {
    total: number;
    failed: number;
    items: MissingItem[];
}

interface SweepResult {
    tried: number;
    found: number;
    missed: number;
    configured: boolean;
}

export interface MissingCoordinatesProps {
    /** Открыть карточку адреса — там карта, точку можно поставить руками */
    onOpen: (id: string) => void;
    /** Координаты нашлись: список адресов на странице пора перечитать */
    onFound: () => void;
    /**
     * Меняется, когда адреса на странице перечитали.
     *
     * Без этого только что заведённый адрес без координат в полосу не
     * попадал: она считает при первом появлении, а страница после
     * сохранения не перезагружается. Человек видел «2 адреса» там, где их
     * уже три, и решал, что новый адрес пропал.
     */
    reloadKey?: number;
}

const plural = (n: number, one: string, few: string, many: string) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
};

export default function MissingCoordinates({ onOpen, onFound, reloadKey = 0 }: MissingCoordinatesProps) {
    const [data, setData] = useState<MissingResponse | null>(null);
    const [open, setOpen] = useState(false);
    const [searching, setSearching] = useState(false);

    const load = useCallback(async () => {
        try {
            const response = await api.get('/locations/missing-coordinates');
            setData(response.data);
        } catch {
            // Молча: это подсказка, а не главное содержимое страницы. Ошибка
            // здесь не должна выглядеть как поломка справочника адресов.
            setData(null);
        }
    }, []);

    useEffect(() => { void load(); }, [load, reloadKey]);

    const search = async () => {
        setSearching(true);
        try {
            const response = await api.post('/locations/geocode-missing');
            const result: SweepResult = response.data;

            if (!result.configured) {
                toast.warning('Геокодер сейчас не отвечает. Адреса на месте — точки допишем, когда он снова заработает.');
                return;
            }
            if (result.found > 0) {
                toast.success(`Нашли ${result.found} ${plural(result.found, 'адрес', 'адреса', 'адресов')} из ${result.tried}`);
                onFound();
            } else if (result.tried > 0) {
                toast.warning('Геокодер не узнал ни один адрес. Точку можно поставить на карте самим — откройте адрес.');
            } else {
                toast.info('Искать нечего: все адреса уже с точками');
            }
            await load();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Не удалось поискать координаты');
        } finally {
            setSearching(false);
        }
    };

    if (!data || data.total === 0) return null;

    const { total, failed, items } = data;

    return (
        <div className={styles.box}>
            <div className={styles.head}>
                <span className={styles.icon}><EnvironmentOutlined /></span>
                <div className={styles.text}>
                    <div className={styles.title}>
                        {total} {plural(total, 'адрес', 'адреса', 'адресов')} без точки на карте
                    </div>
                    <div className={styles.sub}>
                        {failed > 0
                            ? `Маршрут по ним не построится. ${failed} ${plural(failed, 'адрес', 'адреса', 'адресов')} геокодер уже не узнал — откройте и отметьте точку на карте сами.`
                            : 'Маршрут по ним не построится. Точки допишутся сами, когда геокодер ответит.'}
                    </div>
                </div>
                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.primary}
                        onClick={search}
                        disabled={searching}
                    >
                        {searching ? 'Ищем…' : 'Найти сейчас'}
                    </button>
                    <button type="button" className={styles.toggle} onClick={() => setOpen(!open)}>
                        {open ? 'Свернуть' : 'Показать'} {open ? <UpOutlined /> : <DownOutlined />}
                    </button>
                </div>
            </div>

            {open && (
                <div className={styles.list}>
                    {items.map((item) => {
                        const parts = [item.country, item.region, item.city, item.street, item.house]
                            .filter(Boolean).join(', ');
                        return (
                            <button
                                type="button"
                                key={item.id}
                                className={styles.item}
                                onClick={() => onOpen(item.id)}
                            >
                                <span className={styles.itemName}>{item.name}</span>
                                <span className={styles.itemAddress}>{item.address || parts || '—'}</span>
                                {item.geocodeFailedAt && <span className={styles.itemMark}>не нашёлся</span>}
                            </button>
                        );
                    })}
                    {items.length < total && (
                        <div className={styles.more}>
                            и ещё {total - items.length} — покажем, когда разберём эти
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
