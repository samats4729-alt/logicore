'use client';

import { useState, useRef, useEffect } from 'react';
import { AutoComplete, Input } from 'antd';
import { EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { api, GeoProviderHierarchy } from '@/lib/api';
import Loader from '@/components/ui/Loader';

interface DgisAddressFeature {
    id: string;
    place_name: string;
    center: [number, number];
    text?: string;
    geography?: GeoProviderHierarchy;
}

interface AddressAutocompleteProps {
    value?: string;
    onChange?: (value: string) => void;
    /**
     * Выбрали подсказку.
     *
     * `streetLine` — улица с домом отдельной строкой («Сатпаева, 90/1»).
     * Нужна, чтобы форма заполнила поля «Улица» и «Дом», а не оставила всё
     * одной строкой: по частям потом ищется адрес, когда геокодер снова
     * ответит, и по ним же собирается адрес для документов.
     */
    onSelect?: (
        address: string,
        lat: number,
        lng: number,
        geography?: GeoProviderHierarchy,
        streetLine?: string,
    ) => void;
    placeholder?: string;
    size?: 'small' | 'middle' | 'large';
    proximity?: { lat: number; lng: number };
    city?: string;
    disabled?: boolean;
}

export default function AddressAutocomplete({
    value,
    onChange,
    onSelect,
    placeholder = 'Введите адрес...',
    size = 'large',
    proximity,
    city,
    disabled,
}: AddressAutocompleteProps) {
    const [options, setOptions] = useState<{ value: string; label: React.ReactNode; data: DgisAddressFeature }[]>([]);
    const [loading, setLoading] = useState(false);
    const [keyMissing, setKeyMissing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Debounced search effect
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (!searchQuery || searchQuery.length < 2) {
            setOptions([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                // Подсказки идут через наш API (/geo/suggest): ключ 2ГИС хранится
                // на сервере, повторные запросы отдаются из кэша Redis

                let q = searchQuery;
                // 2GIS handles city context well, but appending prevents global search
                if (city && !searchQuery.toLowerCase().includes(city.toLowerCase())) {
                    q = `${city}, ${searchQuery}`;
                }

                const response = await api.get('/geo/suggest', { params: { q } });
                if (response.data?.configured === false) {
                    setKeyMissing(true);
                    setOptions([]);
                    return;
                }
                setKeyMissing(false);
                const items = response.data?.items || [];

                setOptions(
                    items.filter((item: any) => item?.point).map((item: any) => {
                        // 2GIS Mapping
                        // full_name: "Алматы, Сатпаева, 90/1" (Often cleanest)
                        // address_name: "Сатпаева, 90/1"
                        // building_name: "ЖК Симфония" 
                        // name: "Симфония" (POI name)

                        const val = item.full_name || item.full_address_name || item.address_name || item.name;
                        const subVal = item.building_name || item.purpose_name || '';

                        return {
                            value: val,
                            data: {
                                id: item.id,
                                place_name: val,
                                center: [item.point.lon, item.point.lat], // Lon, Lat
                                // Только настоящий уличный адрес. У посёлка
                                // его нет, и подставлять вместо него название
                                // места нельзя: в поле «Улица» попадала
                                // «Шардара» — сам посёлок вместо улицы.
                                text: item.address_name,
                                geography: item.geography,
                            },
                            label: (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
                                    <EnvironmentOutlined style={{ color: '#10c611', marginTop: 4 }} /> {/* 2GIS Greenish color */}
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: 15 }}>
                                            {item.address_name || item.name}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#888' }}>
                                            {item.full_name}
                                            {subVal && ` • ${subVal}`}
                                        </div>
                                    </div>
                                </div>
                            ),
                        };
                    })
                );
            } catch (error) {
                console.error('2GIS error:', error);
                setOptions([]);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchQuery, city]);

    const handleSearch = (searchText: string) => {
        // Do not call onChange immediately if we want to wait for selection, 
        // but typically autocomplete updates value as you type.
        onChange?.(searchText);
        setSearchQuery(searchText);
    };

    const handleSelect = (selectedValue: string, option: any) => {
        const feature = option.data;
        const [lng, lat] = feature.center;

        // Pass the formatting we created in map() directly
        const formattedAddress = feature.place_name;

        onChange?.(formattedAddress);
        onSelect?.(formattedAddress, lat, lng, feature.geography, feature.text);
    };

    return (
        <AutoComplete
            value={value}
            options={options}
            onSearch={handleSearch}
            onSelect={handleSelect}
            style={{ width: '100%' }}
            notFoundContent={
                loading
                    ? <Loader size="small" />
                    : keyMissing && searchQuery.length >= 2
                        ? <span style={{ fontSize: 12, color: '#b45309' }}>Поиск адресов не настроен: задайте DGIS_API_KEY на api-сервисе</span>
                        : null
            }
            disabled={disabled}
        >
            <Input
                placeholder={placeholder}
                size={size}
                disabled={disabled}
                suffix={loading ? <Loader size="small" /> : <SearchOutlined style={{ color: '#bbb' }} />}
            />
        </AutoComplete>
    );
}
