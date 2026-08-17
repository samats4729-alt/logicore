'use client';

import { useEffect, useRef, useState } from 'react';
import { AutoComplete, Form, Input, Row, Col, Select, Typography, Button, FormInstance, Radio } from 'antd';
import { EnvironmentOutlined, CheckCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { api, Location, Country, City, GeoProviderHierarchy } from '@/lib/api';
import dynamic from 'next/dynamic';
import AddressAutocomplete from './AddressAutocomplete';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import { composeAddressPreview, tidyAddressPart, type AddressPartKind } from '@/lib/address';

const MapPicker = dynamic(() => import('./MapPicker'), {
    ssr: false,
    loading: () => <div style={{ height: 400, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Загрузка карты...</div>
});

const { Text } = Typography;
const { Option } = Select;

/**
 * Разделить строку подсказки на улицу и дом.
 *
 * 2ГИС отдаёт их вместе: «Сатпаева, 90/1», «улица Мамедова, 2». Дом —
 * последний кусок, начинающийся с цифры; остальное улица. Тип улицы
 * («проспект», «улица») не трогаем: «проспект Абая» и «улица Абая» в одном
 * городе — разные улицы.
 */
export function splitStreetHouse(line?: string | null): { street?: string; house?: string } {
    const value = (line || '').trim();
    if (!value) return {};

    const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && /^\d/.test(parts[parts.length - 1])) {
        return { street: parts.slice(0, -1).join(', '), house: parts[parts.length - 1] };
    }

    // Без запятой: «Сатпаева 90/1» — дом отделён пробелом.
    const match = value.match(/^(.*\S)\s+(\d\S*)$/);
    if (match) return { street: match[1], house: match[2] };
    return { street: value };
}



export interface LocationFormProps {
    form: FormInstance;
    onFinish: (values: any) => Promise<void> | void;
    editingLocation?: Location | null;
    defaultCompanyId?: string;
    showCompanySelect?: boolean;
    customerCompany?: { id: string; name: string };
    carrierCompany?: { id: string; name: string };
}

export default function LocationForm({
    form,
    onFinish,
    editingLocation,
    defaultCompanyId,
    showCompanySelect = true,
    customerCompany,
    carrierCompany
}: LocationFormProps) {

    // Coordinates managed manually to sync with Map
    const [lat, setLat] = useState<number | undefined>();
    const [lng, setLng] = useState<number | undefined>();
    const [addressValue, setAddressValue] = useState('');

    // Город определяется автоматически из ответа 2ГИС (нужен для тарифов и подписей маршрута)
    const [city, setCity] = useState<string | undefined>(undefined);

    // Страна/город: сперва выбираем их, карта центрируется на городе, затем ищем улицу внутри города
    const [countries, setCountries] = useState<Country[]>([]);
    const [selectedCountryId, setSelectedCountryId] = useState<string | undefined>(undefined);
    const [cityOptions, setCityOptions] = useState<City[]>([]);
    const [cityLoading, setCityLoading] = useState(false);
    const [selectedCityId, setSelectedCityId] = useState<string | undefined>(undefined);
    const [cityFocus, setCityFocus] = useState<{ lat: number; lng: number } | undefined>(undefined);
    const cityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Companies/Partners for linking
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(false);
    const [isFetchingAddress, setIsFetchingAddress] = useState(false);
    /* Точку выбрал человек, а не подсказка геокодера. Такие координаты
       фоновая дозапись не перебивает: человек знает, где въезд на склад. */
    const [pointIsManual, setPointIsManual] = useState(false);
    /* Работает ли поиск адресов. `null` — ещё не знаем. Спрашиваем один раз
       при открытии формы: ответ лежит в кэше сервера неделю, так что
       оплаченных запросов это почти не стоит, зато человек видит правду, а
       не пустой поиск без объяснения. */
    const [geoReady, setGeoReady] = useState<boolean | null>(null);

    useEffect(() => {
        if (showCompanySelect) {
            fetchCompanies();
        }
    }, [showCompanySelect]);

    useEffect(() => {
        api.get('/geo/suggest', { params: { q: 'Алматы' } })
            .then((res) => setGeoReady(res.data?.configured !== false))
            .catch(() => setGeoReady(false));
    }, []);

    useEffect(() => {
        if (editingLocation) {
            setAddressValue(editingLocation.address || '');
            setLat(editingLocation.latitude);
            setLng(editingLocation.longitude);
            form.setFieldsValue({
                address: editingLocation.address,
                latitude: editingLocation.latitude,
                longitude: editingLocation.longitude,
                name: editingLocation.name,
                contactName: editingLocation.contactName,
                contactPhone: editingLocation.contactPhone,
                emails: editingLocation.emails ? editingLocation.emails.split(',').map((e: string) => e.trim()).filter(Boolean) : [],
                companyId: editingLocation.companyId || undefined,
                // Части адреса, введённые руками, — иначе при правке они
                // пропадали бы из формы и затирались пустыми.
                country: (editingLocation as any).country || editingLocation.cityRecord?.country?.name || undefined,
                region: (editingLocation as any).region || undefined,
                street: (editingLocation as any).street || undefined,
                house: (editingLocation as any).house || undefined,
                city: editingLocation.city || undefined,
            });
            setPointIsManual(Boolean((editingLocation as any).coordinatesManual));

            setCity(editingLocation.city || undefined);
            setSelectedCityId(editingLocation.cityId || undefined);
            if (editingLocation.cityRecord) {
                setCityOptions([editingLocation.cityRecord]);
                setSelectedCountryId(editingLocation.cityRecord.countryId);
                setCityFocus({
                    lat: editingLocation.cityRecord.latitude,
                    lng: editingLocation.cityRecord.longitude,
                });
            } else {
                setCityOptions([]);
                setCityFocus(undefined);
            }
        } else {
            setAddressValue('');
            setLat(undefined);
            setLng(undefined);
            setCity(undefined);
            setSelectedCityId(undefined);
            setSelectedCountryId(countries.find(c => c.code === 'KZ' || /казах/i.test(c.name))?.id);
            setCityOptions([]);
            setCityFocus(undefined);
            form.resetFields();
            if (defaultCompanyId) {
                form.setFieldsValue({ companyId: defaultCompanyId });
            }
            form.setFieldsValue({ bindingType: 'none' });
        }
    }, [editingLocation, defaultCompanyId]);

    /**
     * Уходим из поля — приводим написанное в порядок.
     *
     * Сразу, на глазах: человек видит «Мамедова» вместо «МАМЕДОВА» и
     * понимает, что именно сохранится. Сервер сделает то же самое при
     * записи — это подстраховка, а не дубль ради дубля.
     */
    const tidyField = (name: AddressPartKind) => () => {
        const was = form.getFieldValue(name);
        const now = tidyAddressPart(was, name);
        if (now !== (was || '')) form.setFieldsValue({ [name]: now || undefined });
        if (name === 'city') setCity(now || undefined);
    };

    const fetchCompanies = async () => {
        setCompaniesLoading(true);
        try {
            const [partnersRes, externalRes, profileRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
                api.get('/company/profile'),
            ]);
            const partnersList = partnersRes.data;
            const externalList = externalRes.data.map((e: any) => ({
                id: e.id,
                name: e.name,
            }));
            const ownCompany = profileRes.data ? [{ id: profileRes.data.id, name: `${profileRes.data.name} (Моя компания)` }] : [];
            const combined = [...ownCompany, ...partnersList, ...externalList];

            // Deduplicate
            const seen = new Set();
            const unique = combined.filter(c => {
                if (!c.id) return false;
                if (seen.has(c.id)) return false;
                seen.add(c.id);
                return true;
            });
            setCompanies(unique);
        } catch (e) {
            console.error('Failed to fetch companies', e);
        } finally {
            setCompaniesLoading(false);
        }
    };

    // Список стран (по умолчанию — Казахстан)
    useEffect(() => {
        api.get('/cities/countries').then(res => {
            const list: Country[] = res.data || [];
            setCountries(list);
            setSelectedCountryId(prev => prev ?? (list.find(c => c.code === 'KZ' || /казах/i.test(c.name))?.id));
        }).catch(() => { });
    }, []);

    // Поиск городов по мере ввода (сервер отдаёт города с координатами)
    const searchCities = (q: string) => {
        if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
        if (!q || q.trim().length < 1) { setCityOptions([]); return; }
        cityDebounceRef.current = setTimeout(async () => {
            setCityLoading(true);
            try {
                const res = await api.get('/cities', { params: { search: q.trim() } });
                let list: City[] = res.data || [];
                if (selectedCountryId) {
                    list = list.filter((c: any) => {
                        const cid = c.country?.id || c.countryId;
                        return !cid || cid === selectedCountryId;
                    });
                }
                setCityOptions(list);
            } catch {
                setCityOptions([]);
            } finally {
                setCityLoading(false);
            }
        }, 350);
    };

    // Выбор города: центрируем карту на городе и очищаем адрес для ввода улицы
    const handleCitySelect = (cityId: string) => {
        setSelectedCityId(cityId);
        const c = cityOptions.find(o => o.id === cityId);
        if (!c) return;
        setCity(c.name);
        if (c.latitude && c.longitude) {
            setCityFocus({ lat: c.latitude, lng: c.longitude });
        }
        // Улицу вводим заново — внутри выбранного города
        setAddressValue('');
        setLat(undefined);
        setLng(undefined);
        form.setFieldsValue({ address: '', latitude: undefined, longitude: undefined });
    };

    const importProviderGeography = async (
        geography: GeoProviderHierarchy | undefined,
        latitude: number,
        longitude: number,
    ) => {
        if (!geography?.country || !geography.city) return null;

        try {
            const response = await api.post('/cities/import-from-provider', {
                provider: geography.provider,
                country: geography.country,
                region: geography.region,
                city: geography.city,
                latitude,
                longitude,
            });
            const imported = response.data as { country: Country; region?: { id: string; name: string } | null; city: City };
            const importedCity: City = {
                ...imported.city,
                country: imported.country,
                region: imported.region || undefined,
            };

            setCountries(current => current.some(country => country.id === imported.country.id)
                ? current.map(country => country.id === imported.country.id ? imported.country : country)
                : [...current, imported.country].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
            setSelectedCountryId(imported.country.id);
            setSelectedCityId(imported.city.id);
            setCity(imported.city.name);
            setCityOptions(current => [
                importedCity,
                ...current.filter(option => option.id !== imported.city.id),
            ]);
            setCityFocus({ lat: imported.city.latitude, lng: imported.city.longitude });
            return importedCity;
        } catch (error) {
            console.error('Failed to import geography from 2GIS', error);
            toast.warning('Адрес выбран, но город не добавился в справочник. Его можно сохранить и повторить позже.');
            return null;
        }
    };

    const handleAddressSelect = async (
        address: string,
        latitude: number,
        longitude: number,
        geography?: GeoProviderHierarchy,
        streetLine?: string,
    ) => {
        setAddressValue(address);
        setLat(latitude);
        setLng(longitude);
        setPointIsManual(false);
        form.setFieldsValue({ address, latitude, longitude });

        // Подсказка заполняет поля, а не оставляет всё одной строкой.
        // Раньше страна, область, улица и дом оставались пустыми — и когда
        // геокодер отваливался, искать адрес заново было не по чему, а в
        // документ уходила строка, которую человек уже не мог поправить.
        //
        // Улицу берём только из уличного адреса подсказки. Выбрали посёлок —
        // улицы у него нет, и поле остаётся пустым: подставлять туда
        // название самого посёлка («Улица: Шардара») хуже, чем пустота.
        const picked = splitStreetHouse(streetLine);
        const cityName = geography?.city?.name;
        const street = picked.street && picked.street !== cityName ? picked.street : undefined;

        form.setFieldsValue({
            country: geography?.country?.name || form.getFieldValue('country') || undefined,
            region: geography?.region?.name || form.getFieldValue('region') || undefined,
            city: cityName || form.getFieldValue('city') || undefined,
            // Есть улица в подсказке — она главнее набранного. Нет —
            // оставляем то, что человек уже вписал сам.
            street: street || form.getFieldValue('street') || undefined,
            house: street ? (picked.house || undefined) : form.getFieldValue('house') || undefined,
        });

        if (geography?.city?.name) setCity(geography.city.name);
        const importedCity = await importProviderGeography(geography, latitude, longitude);
        if (!importedCity && !geography?.city?.name) {
            // Fallback for providers that returned an address without administrative fields.
            const cityCandidate = address.includes(',') ? address.split(',')[0].trim() : '';
            if (cityCandidate) setCity(cityCandidate);
        }
    };

    const handleMapSelect = async (latitude: number, longitude: number, pickedName?: string) => {
        setLat(latitude);
        setLng(longitude);
        setPointIsManual(true);
        form.setFieldsValue({ latitude, longitude });

        if (pickedName) {
            setAddressValue(pickedName);
            form.setFieldsValue({ address: pickedName });
            toast.success(`Выбрано: ${pickedName}`, { id: 'geo' });
            return;
        }

        const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setAddressValue(coords);
        form.setFieldsValue({ address: coords });
        toast.info('Точка выбрана. Нажмите "Определить адрес", если нужно.', { id: 'geo' });
    };

    const handleManualGeocode = async () => {
        if (!lat || !lng) return;

        setIsFetchingAddress(true);
        try {
            // Обратный геокодинг через наш API (/geo/reverse) с кэшем
            const res = await api.get('/geo/reverse', { params: { lat, lon: lng } });
            if (res.data?.configured === false) {
                toast.warning('Геокодер не настроен: задайте DGIS_API_KEY на api-сервисе');
                return;
            }
            const data2gis = { result: { items: res.data?.items || [] } };

            let finalName = '';
            if (data2gis && data2gis.result && data2gis.result.items && data2gis.result.items.length > 0) {
                const bestItem = data2gis.result.items[0];
                if (bestItem.building_name) {
                    finalName = bestItem.address_name ? `${bestItem.building_name} (${bestItem.address_name})` : bestItem.building_name;
                } else {
                    finalName = bestItem.address_name || bestItem.full_name;
                }
                if (!finalName && bestItem.name) finalName = bestItem.name;
            }

            if (finalName) {
                setAddressValue(finalName);
                form.setFieldsValue({ address: finalName });
                toast.success(`Адрес: ${finalName}`, { id: 'geo' });
            } else {
                toast.warning('Не удалось определить точный адрес. Введите вручную.');
            }

            if (data2gis?.result?.items?.length > 0) {
                const bestItem = data2gis.result.items[0];
                const cityFromGeo = (bestItem.adm_div || []).find((d: any) => d.type === 'city')?.name
                    || (bestItem.full_name ? String(bestItem.full_name).split(',')[0].trim() : '');
                if (cityFromGeo) setCity(cityFromGeo);
                await importProviderGeography(bestItem.geography, lat, lng);
            }
        } catch (e) {
            console.error('Manual geocode error', e);
            toast.error('Ошибка соединения с 2GIS');
        } finally {
            setIsFetchingAddress(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={(values) => {
            // Координаты больше не обязательны. Раньше здесь стоял отказ, и
            // при недоступном геокодере адрес завести было нельзя вовсе —
            // значит нельзя оформить рейс. Теперь точка появится сама, когда
            // геокодер снова ответит.
            if (!values.city && !addressValue) {
                toast.error('Укажите хотя бы город или адрес');
                return;
            }
            let finalCompanyId = values.companyId;
            if (customerCompany || carrierCompany) {
                if (values.bindingType === 'customer') {
                    finalCompanyId = customerCompany?.id;
                } else if (values.bindingType === 'carrier') {
                    finalCompanyId = carrierCompany?.id;
                } else {
                    finalCompanyId = undefined;
                }
            }
            // Include dynamic state values not managed natively by form fields if any
            const { bindingType, ...rest } = values;
            void onFinish({
                ...rest,
                companyId: finalCompanyId,
                address: addressValue || undefined,
                latitude: lat ?? null,
                longitude: lng ?? null,
                // Точку выбрал человек — дозапись её не тронет.
                coordinatesManual: pointIsManual,
                country: values.country || null,
                region: values.region || null,
                street: values.street || null,
                house: values.house || null,
                city: values.city || city || null,
                cityId: selectedCityId || null,
            });
        }}>
            <Row gutter={24}>
                <Col span={10}>
                    <Form.Item
                        name="name"
                        label="Название точки"
                        rules={[{ required: true, message: 'Например: Склад Алматы 1' }]}
                    >
                        <Input placeholder="Склад №1" size="large" />
                    </Form.Item>

                    {/* Быстрый путь — сверху: одна подсказка заполняет все поля
                        ниже. Когда геокодер молчит, поле не показываем вовсе:
                        пустой поиск без объяснения выглядит поломкой, а поля
                        под ним работают и без него. */}
                    {geoReady !== false ? (
                        <Form.Item
                            label="Найти адрес"
                            help={city ? `Ищем в городе: ${city}. Поля ниже заполнятся сами` : 'Заполнит поля ниже'}
                        >
                            <AddressAutocomplete
                                value={addressValue}
                                onChange={(val) => {
                                    setAddressValue(val);
                                    form.setFieldsValue({ address: val });
                                }}
                                onSelect={handleAddressSelect}
                                city={city}
                                proximity={cityFocus}
                                placeholder={city ? 'Улица и дом, напр.: Сатпаева 90/1' : 'Например: Алматы, Сатпаева 90/1'}
                            />
                        </Form.Item>
                    ) : (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                            fontSize: 13, lineHeight: 1.45,
                            background: 'var(--nova-surface-2)', border: '1px solid var(--nova-border)',
                            color: 'var(--nova-fg-2)',
                        }}>
                            <SearchOutlined /> Поиск адреса сейчас выключен. Заполните поля ниже — точку найдём, когда он заработает
                        </div>
                    )}

                    <Row gutter={12}>
                        <Col span={10}>
                            {/* Страна — обычное поле с подсказками, а не выбор
                                из списка. Перевозки бывают не только по
                                Казахстану, а список знает только то, что
                                когда-то вернул геокодер. */}
                            <Form.Item name="country" label="Страна">
                                <AutoComplete
                                    size="large"
                                    placeholder="Казахстан"
                                    options={countries.map(c => ({ value: c.name, id: c.id }))}
                                    filterOption={(input, option) =>
                                        String(option?.value || '').toLowerCase().includes(input.toLowerCase())}
                                    onSelect={(_value, option: any) => {
                                        setSelectedCountryId(option?.id);
                                        setSelectedCityId(undefined);
                                        setCity(undefined);
                                        setCityOptions([]);
                                        setCityFocus(undefined);
                                    }}
                                    onChange={(value) => {
                                        // Написали своё — привязка к справочнику
                                        // теряется, и это нормально.
                                        if (!countries.some(c => c.name === value)) setSelectedCountryId(undefined);
                                    }}
                                    onBlur={tidyField('country')}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={14}>
                            {/* Область — рядом со страной: адрес читается
                                сверху вниз, от крупного к мелкому. Раньше она
                                стояла ниже улицы, и заполняли её в последнюю
                                очередь или не заполняли вовсе. */}
                            <Form.Item name="region" label="Область или район">
                                <Input size="large" placeholder="Туркестанская область" onBlur={tidyField('region')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={12}>
                        <Col span={24}>
                            {/* Город тоже пишется свободно. Из-за выбора только
                                из списка компания не смогла завести Мынарал:
                                его не знал геокодер, значит не было и в
                                справочнике. Справочник теперь подсказывает, а
                                не ограничивает. */}
                            <Form.Item
                                name="city"
                                label="Город или посёлок"
                                help="Нет в подсказках — впишите как есть"
                            >
                                <AutoComplete
                                    size="large"
                                    placeholder="Начните вводить город"
                                    onSearch={searchCities}
                                    filterOption={false}
                                    notFoundContent={cityLoading ? <Loader size="small" /> : null}
                                    options={cityOptions.map(c => ({
                                        value: c.name,
                                        id: c.id,
                                        label: `${c.name}${(c as any).region?.name ? `, ${(c as any).region.name}` : ''}`,
                                    }))}
                                    onSelect={(value, option: any) => {
                                        setCity(String(value));
                                        if (option?.id) handleCitySelect(option.id);
                                    }}
                                    onChange={(value) => {
                                        setCity(value ? String(value) : undefined);
                                        if (!cityOptions.some(c => c.name === value)) setSelectedCityId(undefined);
                                    }}
                                    onBlur={tidyField('city')}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Ручной ввод. Он же — единственный путь, когда геокодер
                        молчит: кончились запросы, нет ключа, нет сети. Раньше
                        в этот момент адрес завести было нельзя вовсе. */}
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="street" label="Улица">
                                <Input size="large" placeholder="Сатпаева" onBlur={tidyField('street')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="house" label="Дом">
                                <Input size="large" placeholder="90/1" onBlur={tidyField('house')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Как адрес попадёт в документы. Показываем до сохранения:
                        человек видит результат, а не догадывается о нём — и
                        сразу замечает, если поля разъехались. */}
                    <Form.Item noStyle shouldUpdate>
                        {() => {
                            const preview = composeAddressPreview(form.getFieldsValue(), addressValue);
                            if (!preview) return null;
                            return (
                                <div style={{
                                    padding: '9px 14px', borderRadius: 10, marginBottom: 16,
                                    background: 'var(--nova-surface-2)', border: '1px solid var(--nova-border)',
                                }}>
                                    <div style={{ fontSize: 11, color: 'var(--nova-fg-3)', marginBottom: 2 }}>
                                        В документах и в списке будет так
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--nova-fg)' }}>{preview}</div>
                                </div>
                            );
                        }}
                    </Form.Item>

                    {/* Отсутствие координат — не ошибка человека, а состояние
                        адреса, поэтому строка спокойная и объясняет, что будет
                        дальше. Цвета из наших токенов: зелёный с белым текстом
                        был записан прямо здесь и в тёмной теме светился. */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 10,
                        marginBottom: 16,
                        fontSize: 13,
                        lineHeight: 1.45,
                        background: 'var(--nova-surface-2)',
                        border: '1px solid var(--nova-border)',
                        color: 'var(--nova-fg-2)',
                    }}>
                        {(lat && lng)
                            ? <><CheckCircleOutlined /> Точка на карте есть — маршрут построится</>
                            : <><EnvironmentOutlined /> Координат пока нет. Адрес сохранится, а точку найдём, когда геокодер ответит — или укажите её на карте сами</>}
                    </div>

                    { (customerCompany?.id || carrierCompany?.id) ? (
                        <Form.Item name="bindingType" label="Привязать адрес к участнику заявки" initialValue="none">
                            <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Radio value="none">Без привязки (разовый общий адрес)</Radio>
                                {customerCompany?.id && (
                                    <Radio value="customer">Заказчик: {customerCompany.name}</Radio>
                                )}
                                {carrierCompany?.id && (
                                    <Radio value="carrier">Исполнитель: {carrierCompany.name}</Radio>
                                )}
                            </Radio.Group>
                        </Form.Item>
                    ) : showCompanySelect && (
                        <Form.Item name="companyId" label="Привязать к контрагенту (компании)">
                            <Select placeholder="Без привязки (общий)" allowClear showSearch optionFilterProp="children" loading={companiesLoading}>
                                {companies.map(c => (
                                    <Option key={c.id} value={c.id}>{c.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    )}

                    <Form.Item name="emails" label="Email-адреса склада" help="Введите email и нажмите Enter">
                        <Select mode="tags" placeholder="warehouse@company.com" tokenSeparators={[',', ' ']} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="contactName" label="Контактное лицо">
                        <Input placeholder="Иван Иванов" />
                    </Form.Item>
                    <Form.Item name="contactPhone" label="Телефон">
                        <Input placeholder="+7..." />
                    </Form.Item>
                </Col>
                <Col span={14}>
                    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text strong style={{ fontSize: 14 }}>Точка на карте</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>можно кликнуть по карте вручную</Text>
                    </div>
                    <div style={{ border: '1px solid var(--lc-border)', borderRadius: 14, overflow: 'hidden', position: 'relative', boxShadow: '0 10px 28px -18px rgba(16,24,40,0.3)' }}>
                        <MapPicker
                            onLocationSelect={handleMapSelect}
                            initialLat={lat}
                            initialLng={lng}
                            focusLat={cityFocus?.lat}
                            focusLng={cityFocus?.lng}
                        />
                        <div style={{
                            position: 'absolute',
                            bottom: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 1000,
                            background: 'white',
                            padding: 4,
                            borderRadius: 6,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}>
                            <Button
                                type="primary"
                                onClick={handleManualGeocode}
                                loading={isFetchingAddress}
                                disabled={!lat || !lng}
                                icon={<EnvironmentOutlined />}
                            >
                                Определить адрес
                            </Button>
                        </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            При выборе адреса карта автоматически переместится к нужной точке
                        </Text>
                    </div>
                </Col>
            </Row>
        </Form>
    );
}
