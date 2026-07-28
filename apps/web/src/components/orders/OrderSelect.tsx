'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Select, Spin } from 'antd';
import { api } from '@/lib/api';
import { reportLoadFailure } from '@/lib/load';

/**
 * Выбор заявки с поиском по всей базе.
 *
 * Раньше экраны расходов, кассы и операций забирали первые 300 заявок и
 * искали среди них на месте. У компании с четырьмя сотнями рейсов нужного
 * в списке просто не было, и понять это было нельзя: список выглядел
 * полным. Искать при этом можно было только по номеру — а логист помнит
 * «то, что везли в Атырау», и лезет за номером в другой экран.
 *
 * Теперь ищет сервер: по номеру, грузу, городу маршрута и заказчику.
 *
 * Уже выбранная заявка подгружается отдельно. Иначе при открытии старого
 * расхода поле показывало бы пустоту: заявки полугодовой давности нет
 * среди последних, а человек решил бы, что связь потерялась.
 */
export default function OrderSelect({
    value,
    onChange,
    placeholder = 'Номер, груз, город или заказчик',
    disabled,
}: {
    value?: string;
    onChange?: (id: string | undefined) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState<{ value: string; label: string } | null>(null);
    const requestId = useRef(0);

    const label = (o: any) => {
        const route = (o.routePoints || [])
            .map((p: any) => p.location?.city || p.location?.name)
            .filter(Boolean);
        const where = route.length ? ` · ${route[0]} → ${route[route.length - 1]}` : '';
        const cargo = o.cargoDescription || o.natureOfCargo;
        return `${o.orderNumber}${where}${cargo ? ` · ${cargo}` : ''}`;
    };

    const search = useCallback(async (text: string) => {
        const mine = ++requestId.current;
        setLoading(true);
        try {
            const res = await api.get('/orders', { params: { search: text || undefined, limit: 20 } });
            // Ответ на устаревший запрос игнорируем: человек печатает быстрее,
            // чем отвечает сервер, и ответы возвращаются вперемешку.
            if (mine !== requestId.current) return;
            const list = res.data?.data || res.data || [];
            setOptions(list.map((o: any) => ({ value: o.id, label: label(o) })));
        } catch (e: any) {
            if (mine === requestId.current) reportLoadFailure('список заявок', e);
        } finally {
            if (mine === requestId.current) setLoading(false);
        }
    }, []);

    useEffect(() => { search(''); }, [search]);

    // Подтягиваем выбранную заявку, если её нет среди показанных.
    useEffect(() => {
        if (!value || options.some(o => o.value === value) || picked?.value === value) return;
        let alive = true;
        api.get(`/orders/${value}`)
            .then(res => { if (alive && res.data) setPicked({ value, label: label(res.data) }); })
            .catch(() => { if (alive) setPicked({ value, label: 'Заявка не открылась' }); });
        return () => { alive = false; };
    }, [value, options, picked?.value]);

    const shown = useMemo(() => {
        if (picked && !options.some(o => o.value === picked.value)) return [picked, ...options];
        return options;
    }, [options, picked]);

    const debounced = useRef<ReturnType<typeof setTimeout>>();
    const onSearch = (text: string) => {
        clearTimeout(debounced.current);
        debounced.current = setTimeout(() => search(text), 300);
    };

    return (
        <Select
            showSearch
            allowClear
            disabled={disabled}
            value={value}
            onChange={(id) => onChange?.(id)}
            onSearch={onSearch}
            // Отбор на месте выключен: список уже отобран сервером, а
            // повторная фильтрация по подписи прятала бы найденное.
            filterOption={false}
            notFoundContent={loading ? <Spin size="small" /> : 'Ничего не найдено'}
            options={shown}
            placeholder={placeholder}
            style={{ width: '100%' }}
        />
    );
}
