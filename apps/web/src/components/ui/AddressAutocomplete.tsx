'use client';

import { useState, useRef, useEffect } from 'react';
import { AutoComplete, Input, Spin } from 'antd';
import { EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';

interface NominatimResult {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    type: string;
    address?: {
        road?: string;
        city?: string;
        state?: string;
        country?: string;
    };
}

interface AddressAutocompleteProps {
    value?: string;
    onChange?: (value: string) => void;
    onSelect?: (address: string, lat: number, lng: number) => void;
    placeholder?: string;
    size?: 'small' | 'middle' | 'large';
}

export default function AddressAutocomplete({
    value,
    onChange,
    onSelect,
    placeholder = 'Введите адрес...',
    size = 'large',
}: AddressAutocompleteProps) {
    const [options, setOptions] = useState<{ value: string; label: React.ReactNode; data: NominatimResult }[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Debounced search effect
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (!searchQuery || searchQuery.length < 3) {
            setOptions([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                // Нормализуем запрос — убираем префиксы и улучшаем поиск
                let cleanQuery = searchQuery
                    .replace(/^г\.|^г\s|город\s/gi, '')  // убираем "г." "г " "город"
                    .replace(/ул\.|ул\s|улица\s/gi, '')  // убираем "ул." "ул " "улица"
                    .replace(/пр\.|пр\s|проспект\s/gi, '') // убираем "пр." проспект
                    .replace(/д\.|д\s|дом\s/gi, ' ')      // убираем "д." дом
                    .replace(/\s+/g, ' ')                 // убираем двойные пробелы
                    .trim();

                // Исправляем распространённые опечатки улиц Алматы
                cleanQuery = cleanQuery
                    .replace(/альфараби/gi, 'Аль-Фараби')
                    .replace(/абылайхан/gi, 'Абылай хана')
                    .replace(/достык/gi, 'Достық')
                    .replace(/толебаев/gi, 'Толе би');

                // Добавляем "Алматы" если не указан город
                const hasCity = /алмат|астан|караганд|шымкент|актоб|нурсултан/i.test(cleanQuery);
                let enhancedQuery = hasCity ? cleanQuery : `${cleanQuery}, Алматы, Казахстан`;

                // Nominatim API - бесплатный геокодер на основе OpenStreetMap
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?` +
                    new URLSearchParams({
                        q: enhancedQuery,
                        format: 'json',
                        addressdetails: '1',
                        limit: '8',
                    }),
                    {
                        headers: {
                            'Accept-Language': 'ru',
                        },
                    }
                );

                const results: NominatimResult[] = await response.json();

                setOptions(
                    results.map((result) => ({
                        value: result.display_name,
                        data: result,
                        label: (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <EnvironmentOutlined style={{ color: '#1677ff', marginTop: 4 }} />
                                <div>
                                    <div style={{ fontWeight: 500 }}>{result.display_name.split(',')[0]}</div>
                                    <div style={{ fontSize: 12, color: '#888' }}>
                                        {result.display_name.split(',').slice(1, 3).join(',')}
                                    </div>
                                </div>
                            </div>
                        ),
                    }))
                );
            } catch (error) {
                console.error('Geocoding error:', error);
                setOptions([]);
            } finally {
                setLoading(false);
            }
        }, 400);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [searchQuery]);

    const handleSearch = (searchText: string) => {
        onChange?.(searchText);
        setSearchQuery(searchText);
    };

    const handleSelect = (selectedValue: string, option: any) => {
        const result = option.data as NominatimResult;
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);

        onChange?.(selectedValue);
        onSelect?.(selectedValue, lat, lng);
    };

    return (
        <AutoComplete
            value={value}
            options={options}
            onSearch={handleSearch}
            onSelect={handleSelect}
            style={{ width: '100%' }}
            notFoundContent={loading ? <Spin size="small" /> : null}
        >
            <Input
                placeholder={placeholder}
                size={size}
                suffix={loading ? <Spin size="small" /> : <SearchOutlined style={{ color: '#bbb' }} />}
            />
        </AutoComplete>
    );
}
