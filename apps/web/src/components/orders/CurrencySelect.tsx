'use client';

import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { api } from '@/lib/api';

/**
 * Выбор валюты для суммы.
 *
 * Живёт внутри форм на Ant Design (мастер заявки, карточка рейса), поэтому
 * сделан на antd — иначе он выглядел бы чужеродно прямо внутри поля суммы.
 * На новых экранах, которые пишутся на shadcn, валюта показывается своими
 * средствами.
 *
 * Список короткий по умолчанию: тенге, СНГ и мировые. Остальные сорок
 * находятся поиском — их видно, но они не мешают.
 */

export interface CurrencyOption {
    code: string;
    nameRu: string;
    symbol: string | null;
    isCommon: boolean;
}

/** Пока справочник не загрузился, показываем хотя бы тенге. */
const FALLBACK: CurrencyOption[] = [{ code: 'KZT', nameRu: 'Казахстанский тенге', symbol: '₸', isCommon: true }];

let cached: CurrencyOption[] | null = null;

export function useCurrencies() {
    const [currencies, setCurrencies] = useState<CurrencyOption[]>(cached || FALLBACK);

    useEffect(() => {
        if (cached) return;
        api.get('/currency')
            .then((res) => {
                if (Array.isArray(res.data) && res.data.length) {
                    cached = res.data;
                    setCurrencies(res.data);
                }
            })
            // Молчим намеренно: без справочника поле остаётся с тенге и
            // работает. Ронять форму создания заявки из-за списка валют
            // было бы хуже самой проблемы.
            .catch(() => { });
    }, []);

    return currencies;
}

export default function CurrencySelect({
    value,
    onChange,
    disabled,
    width = 88,
}: {
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    /** Число — ширина в пикселях, '100%' — во всю ширину поля формы. */
    width?: number | string;
}) {
    const currencies = useCurrencies();

    return (
        <Select
            value={value || 'KZT'}
            onChange={onChange}
            disabled={disabled}
            showSearch
            style={{ width }}
            // Само поле узкое — в строке суммы места нет. А вот список
            // обязан быть широким: «RUB · Ро…» прочитать нельзя.
            popupMatchSelectWidth={260}
            optionFilterProp="label"
            options={currencies.map((c) => ({
                value: c.code,
                // В списке — код и название, в поле остаётся короткий код:
                // в строке суммы длинное название не помещается.
                label: `${c.code} · ${c.nameRu}`,
                title: c.nameRu,
            }))}
            optionLabelProp="value"
        />
    );
}
