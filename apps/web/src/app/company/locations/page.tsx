'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Table, Button, Space, Modal, Form,
    Input, App, Select, Tag, Tooltip
} from 'antd';
import { 
    PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined,
    SearchOutlined, ClearOutlined, MailOutlined, UserOutlined, GlobalOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import LocationForm from '@/components/ui/LocationForm';

const { Option } = Select;

export default function CompanyLocationsPage() {
    const { message } = App.useApp();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);
    const [form] = Form.useForm();

    const [searchText, setSearchText] = useState('');
    const [filterCompanyId, setFilterCompanyId] = useState<string | undefined>(undefined);

    // Companies/Partners for filtering
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(false);

    useEffect(() => {
        fetchLocations();
        fetchCompanies();
    }, []);

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

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch (error) {
            message.error('Ошибка загрузки адресов');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            // countryId/regionId — служебные поля каскада выбора города, бэкенд их не принимает
            const { countryId, regionId, ...restValues } = values;
            const payload = {
                ...restValues,
                emails: values.emails ? values.emails.join(',') : null
            };
            if (editingLocation) {
                await api.put(`/locations/${editingLocation.id}`, payload);
                message.success('Адрес обновлен');
            } else {
                await api.post('/locations', payload);
                message.success('Адрес добавлен');
            }
            setModalOpen(false);
            setEditingLocation(null);
            form.resetFields();
            fetchLocations();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const handleEditClick = (record: Location) => {
        setEditingLocation(record);
        setModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        Modal.confirm({
            title: 'Удалить адрес?',
            content: 'Вы уверены, что хотите удалить этот адрес из списка?',
            okText: 'Удалить',
            cancelText: 'Отмена',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.delete(`/locations/${id}`);
                    message.success('Адрес удалён');
                    fetchLocations();
                } catch (error: any) {
                    message.error(error.response?.data?.message || 'Ошибка удаления');
                }
            },
        });
    };

    const filteredLocations = useMemo(() => {
        return locations.filter(loc => {
            const matchesSearch = !searchText || 
                loc.name.toLowerCase().includes(searchText.toLowerCase()) || 
                loc.address.toLowerCase().includes(searchText.toLowerCase()) ||
                (loc.city && loc.city.toLowerCase().includes(searchText.toLowerCase())) ||
                (loc.contactName && loc.contactName.toLowerCase().includes(searchText.toLowerCase()));

            const matchesCompany = filterCompanyId === undefined || 
                (filterCompanyId === 'global' && !loc.companyId) ||
                (loc.companyId === filterCompanyId);

            return matchesSearch && matchesCompany;
        });
    }, [locations, searchText, filterCompanyId]);

    const getInitials = (name: string) => {
        if (!name || name === '—') return '';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    const columns = [
        {
            title: 'Адрес',
            dataIndex: 'name',
            key: 'name',
            width: 220,
            render: (text: string, record: Location) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Space>
                        <EnvironmentOutlined style={{ color: '#1677ff' }} />
                        <strong style={{ whiteSpace: 'nowrap' }}>{text}</strong>
                    </Space>
                    {record.address && (
                        <span style={{ fontSize: 12, color: 'var(--lc-text-ter)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                            {record.address}
                        </span>
                    )}
                </div>
            ),
        },
        {
            title: 'Контрагент',
            dataIndex: 'company',
            key: 'company',
            width: 170,
            render: (company: any) => {
                if (!company) return (
                    <Space size={8}>
                        <span className="lc2-avatar lc2-avatar-sm" style={{ background: '#f1f2f5', color: '#5f6672', flexShrink: 0 }}>
                            <GlobalOutlined />
                        </span>
                        <span style={{ color: 'var(--lc-text-ter)', fontSize: 13 }}>Общий</span>
                    </Space>
                );
                const initials = getInitials(company.name);
                return (
                    <Space size={8}>
                        <span className="lc2-avatar lc2-avatar-sm" style={{ background: '#e0f2fe', color: '#0369a1', flexShrink: 0 }}>
                            {initials || 'КГ'}
                        </span>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{company.name}</span>
                    </Space>
                );
            }
        },
        {
            title: 'Email',
            dataIndex: 'emails',
            key: 'emails',
            width: 90,
            render: (emails: string) => {
                if (!emails) return '—';
                const list = emails.split(',').map(e => e.trim()).filter(Boolean);
                if (list.length === 0) return '—';
                
                const tooltipContent = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {list.map(email => (
                            <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <MailOutlined style={{ fontSize: 12 }} />
                                <span>{email}</span>
                            </div>
                        ))}
                    </div>
                );

                return (
                    <Tooltip title={tooltipContent} placement="top" color="#1c2536">
                        <Tag icon={<MailOutlined />} color="blue" style={{ cursor: 'pointer', margin: 0, fontWeight: 500 }}>
                            {list.length}
                        </Tag>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Контакт',
            dataIndex: 'contactName',
            key: 'contactName',
            width: 170,
            render: (name: string, record: Location) => {
                if (!name && !record.contactPhone) return '—';
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {name && (
                            <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <UserOutlined style={{ marginRight: 4, color: '#8c8c8c' }} />
                                {name}
                            </span>
                        )}
                        {record.contactPhone && (
                            <span style={{ color: '#8c8c8c', fontSize: 12, whiteSpace: 'nowrap' }}>
                                {record.contactPhone}
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Координаты',
            key: 'coords',
            width: 120,
            render: (_: any, record: Location) => (
                <span style={{ color: 'var(--lc-text-ter)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {record.latitude?.toFixed(4)}, {record.longitude?.toFixed(4)}
                </span>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 80,
            render: (_: any, record: Location) => (
                <Space size="middle">
                    <Button
                        type="text"
                        icon={<EditOutlined style={{ color: '#1677ff' }} />}
                        onClick={() => handleEditClick(record)}
                        style={{ padding: 0 }}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                        style={{ padding: 0 }}
                    />
                </Space>
            ),
        },
    ];

    const locationsWithContacts = locations.filter(l => l.contactName).length;
    const locationsGlobal = locations.filter(l => !l.companyId).length;

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Справочники · Адреса</div>
                    <h1 className="lc2-title">Адреса</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Управление точками погрузки и выгрузки
                    </p>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setEditingLocation(null);
                            form.resetFields();
                            setModalOpen(true);
                        }}
                        className="lc-cta"
                    >
                        Добавить новый адрес
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <EnvironmentOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Всего</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {locations.length}
                            </div>
                            <div className="lc2-msub">адресов</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                            <UserOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">С контактами</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {locationsWithContacts}
                            </div>
                            <div className="lc2-msub">из них с телефоном</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#f1f2f5', color: '#5f6672' }}>
                            <GlobalOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Общие</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {locationsGlobal}
                            </div>
                            <div className="lc2-msub">без привязки</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CONTENT CARD ===== */}
            <div className="lc-card" style={{ padding: 20 }}>
                {/* Search & Filter Panel */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    <Input
                        placeholder="Поиск по названию, адресу или городу..."
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{ maxWidth: 350, flex: 1 }}
                        allowClear
                    />
                    <Select
                        placeholder="Фильтр по контрагенту"
                        value={filterCompanyId}
                        onChange={setFilterCompanyId}
                        style={{ width: 250 }}
                        allowClear
                        loading={companiesLoading}
                    >
                        <Option value="global">📍 Общие адреса (без контрагента)</Option>
                        {companies.map((c: { id: string; name: string }) => (
                            <Option key={c.id} value={c.id}>{c.name}</Option>
                        ))}
                    </Select>
                    {(searchText || filterCompanyId !== undefined) && (
                        <Button 
                            icon={<ClearOutlined />} 
                            onClick={() => {
                                setSearchText('');
                                setFilterCompanyId(undefined);
                            }}
                        >
                            Сбросить
                        </Button>
                    )}
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredLocations}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 'max-content' }}
                    size="small"
                />
            </div>

            <Modal
                title={editingLocation ? "Редактирование адреса" : "Добавление нового адреса"}
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
                    setEditingLocation(null);
                    form.resetFields();
                }}
                onOk={() => form.submit()}
                width={850}
                centered
                destroyOnClose
            >
                <div style={{ marginTop: 16 }}>
                    <LocationForm
                        form={form}
                        editingLocation={editingLocation}
                        onFinish={handleSubmit}
                        showCompanySelect={true}
                    />
                </div>
            </Modal>
        </div>
    );
}
