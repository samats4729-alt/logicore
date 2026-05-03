'use client';

import { useState, useRef, useEffect } from 'react';
import { AutoComplete, Input, Spin } from 'antd';
import { EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';

interface MapboxFeature {
    id: string;
    place_name: string;
    center: [number, number];
    context?: { text: string }[];
    text?: string;
    address?: string;
}

interface AddressAutocompleteProps {
    value?: string;
    onChange?: (value: string) => void;
    onSelect?: (address: string, lat: number, lng: number) => void;
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
    const [options, setOptions] = useState<{ value: string; label: React.ReactNode; data: MapboxFeature }[]>([]);
    const [loading, setLoading] = useState(false);
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
                // 2GIS Geocoder API Implementation
                // Key verified: b018aa68-a110-494a-aa01-26991bd6b4a3

                let q = searchQuery;
                // 2GIS handles city context well, but appending prevents global search
                if (city && !searchQuery.toLowerCase().includes(city.toLowerCase())) {
                    q = `${city}, ${searchQuery}`;
                }

                // 2GIS Params
                const params = new URLSearchParams({
                    q: q,
                    key: 'b018aa68-a110-494a-aa01-26991bd6b4a3',
                    fields: 'items.point,items.address_name,items.building_name,items.full_name',
                    page_size: '10',
                    // Bound search to KZ or Almaty? 2GIS is usually local.
                    // We can use 'region_id' if we know it, or view_point, but 'q' with city is usually enough.
                });

                const response = await fetch(
                    `https://catalog.api.2gis.com/3.0/items/geocode?` + params
                );

                const data = await response.json();

                // 2GIS Response Structure:
                // { meta: { code: 200 }, result: { items: [...] } }
                const items = data.result?.items || [];

                setOptions(
                    items.map((item: any) => {
                        // 2GIS Mapping
                        // full_name: "Алматы, Сатпаева, 90/1" (Often cleanest)
                        // address_name: "Сатпаева, 90/1"
                        // building_name: "ЖК Симфония" 
                        // name: "Симфония" (POI name)

                        const val = item.full_name || item.address_name || item.name;
                        const subVal = item.building_name || item.purpose_name || '';

                        return {
                            value: val,
                            data: {
                                id: item.id,
                                place_name: val,
                                center: [item.point.lon, item.point.lat], // Lon, Lat
                                text: item.address_name || item.name,
                                address: { // Mocking the OSM structure for compatibility if needed
                                    house_number: item.building_name,
                                    road: item.address_name
                                }
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
        onSelect?.(formattedAddress, lat, lng);
    };

    return (
        <AutoComplete
            value={value}
            options={options}
            onSearch={handleSearch}
            onSelect={handleSelect}
            style={{ width: '100%' }}
            notFoundContent={loading ? <Spin size="small" /> : null}
            disabled={disabled}
        >
            <Input
                placeholder={placeholder}
                size={size}
                disabled={disabled}
                suffix={loading ? <Spin size="small" /> : <SearchOutlined style={{ color: '#bbb' }} />}
            />
        </AutoComplete>
    );
}
