'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Table, Button, Space, Modal, Form,
    Input, App, Tag, Tooltip, Segmented
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined,
    SearchOutlined, MailOutlined, UserOutlined, GlobalOutlined,
    RightOutlined, ArrowLeftOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import LocationForm from '@/components/ui/LocationForm';

export default function CompanyLocationsPage() {
    const { message } = App.useApp();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);
    const [addForCompanyId, setAddForCompanyId] = useState<string | undefined>(undefined);
    const [form] = Form.useForm();

    // Навигация: «Общие адреса» ↔ «Контрагенты» (внутри проваливаемся в контрагента)
    const [tab, setTab] = useState<'global' | 'partners'>('global');
    const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');

    useEffect(() => {
        fetchLocations();
    }, []);

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
            const payload = {
                ...values,
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
            setAddForCompanyId(undefined);
            form.resetFields();
            fetchLocations();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const openAdd = (companyId?: string) => {
        setEditingLocation(null);
        setAddForCompanyId(companyId);
        form.resetFields();
        setModalOpen(true);
    };

    const handleEditClick = (record: Location) => {
        setEditingLocation(record);
        setAddForCompanyId(undefined);
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

    const getInitials = (name: string) => {
        if (!name || name === '—') return '';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.slice(0, 2).toUpperCase();
    };

    const pluralAddr = (n: number) => {
        const m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return 'адрес';
        if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'адреса';
        return 'адресов';
    };

    const matchAddr = (loc: Location, q: string) => {
        if (!q) return true;
        const s = q.toLowerCase();
        return loc.name.toLowerCase().includes(s)
            || loc.address.toLowerCase().includes(s)
            || (!!loc.city && loc.city.toLowerCase().includes(s))
            || (!!loc.contactName && loc.contactName.toLowerCase().includes(s));
    };

    // Общие адреса (без контрагента)
    const globalLocations = useMemo(() => locations.filter(l => !l.companyId), [locations]);

    // Группировка по контрагентам (только те, у кого есть адреса)
    const partnerGroups = useMemo(() => {
        const map = new Map<string, { id: string; name: string; items: Location[] }>();
        for (const l of locations) {
            if (!l.companyId) continue;
            const name = (l as any).company?.name || 'Контрагент';
            if (!map.has(l.companyId)) map.set(l.companyId, { id: l.companyId, name, items: [] });
            map.get(l.companyId)!.items.push(l);
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, [locations]);

    const selectedPartner = useMemo(
        () => partnerGroups.find(g => g.id === selectedPartnerId) || null,
        [partnerGroups, selectedPartnerId]
    );

    const filteredGlobal = useMemo(
        () => globalLocations.filter(l => matchAddr(l, searchText)),
        [globalLocations, searchText]
    );
    const filteredPartnerGroups = useMemo(
        () => partnerGroups.filter(g => !searchText || g.name.toLowerCase().includes(searchText.toLowerCase())),
        [partnerGroups, searchText]
    );
    const filteredPartnerItems = useMemo(
        () => (selectedPartner ? selectedPartner.items.filter(l => matchAddr(l, searchText)) : []),
        [selectedPartner, searchText]
    );

    const switchTab = (v: 'global' | 'partners') => {
        setTab(v);
        setSelectedPartnerId(null);
        setSearchText('');
    };

    const columns = [
        {
            title: 'Адрес',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: Location) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Space size={6}>
                        <EnvironmentOutlined style={{ color: '#1677ff' }} />
                        <strong>{text}</strong>
                    </Space>
                    {record.address && (
                        <span style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>
                            {record.city ? `${record.city}, ` : ''}{record.address}
                        </span>
                    )}
                </div>
            ),
        },
        {
            title: 'Email',
            dataIndex: 'emails',
            key: 'emails',
            width: 80,
            align: 'center' as const,
            render: (emails: string) => {
                const list = (emails || '').split(',').map(e => e.trim()).filter(Boolean);
                if (list.length === 0) return <span style={{ color: 'var(--lc-text-ter)' }}>—</span>;
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
            width: 190,
            render: (name: string, record: Location) => {
                if (!name && !record.contactPhone) return <span style={{ color: 'var(--lc-text-ter)' }}>—</span>;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {name && (
                            <span style={{ fontSize: 13, fontWeight: 500 }}>
                                <UserOutlined style={{ marginRight: 4, color: '#8c8c8c' }} />
                                {name}
                            </span>
                        )}
                        {record.contactPhone && (
                            <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.contactPhone}</span>
                        )}
                    </div>
                );
            }
        },
        {
            title: '',
            key: 'actions',
            width: 84,
            align: 'right' as const,
            render: (_: any, record: Location) => (
                <Space size="middle">
                    <Button type="text" icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => handleEditClick(record)} style={{ padding: 0 }} />
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} style={{ padding: 0 }} />
                </Space>
            ),
        },
    ];

    const locationsWithContacts = locations.filter(l => l.contactName).length;

    const searchPlaceholder = tab === 'global'
        ? 'Поиск по названию, адресу, городу...'
        : selectedPartner
            ? `Поиск по адресам · ${selectedPartner.name}`
            : 'Поиск контрагента по названию...';

    return (
        <div className="lc-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Справочники · Адреса</div>
                    <h1 className="lc2-title">Адреса</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Точки погрузки и выгрузки — общие и по контрагентам
                    </p>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openAdd()} className="lc-cta">
                        Добавить новый адрес
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#f1f2f5', color: '#5f6672' }}>
                            <GlobalOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Общие</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{globalLocations.length}</div>
                            <div className="lc2-msub">без привязки</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <EnvironmentOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Контрагентов</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{partnerGroups.length}</div>
                            <div className="lc2-msub">со своими адресами</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                            <UserOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">С контактами</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{locationsWithContacts}</div>
                            <div className="lc2-msub">есть контактное лицо</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CONTENT CARD ===== */}
            <div className="lc-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Segmented
                        value={tab}
                        onChange={(v) => switchTab(v as 'global' | 'partners')}
                        options={[
                            { label: `Общие адреса (${globalLocations.length})`, value: 'global' },
                            { label: `Контрагенты (${partnerGroups.length})`, value: 'partners' },
                        ]}
                    />
                    <Input
                        placeholder={searchPlaceholder}
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{ maxWidth: 340, flex: 1, minWidth: 220 }}
                        allowClear
                    />
                </div>

                {/* --- ВЕТКА: ОБЩИЕ АДРЕСА --- */}
                {tab === 'global' && (
                    <Table
                        columns={columns}
                        dataSource={filteredGlobal}
                        rowKey="id"
                        loading={loading}
                        pagination={{ pageSize: 10, hideOnSinglePage: true }}
                        size="small"
                        locale={{ emptyText: searchText ? 'Ничего не найдено' : 'Пока нет общих адресов' }}
                    />
                )}

                {/* --- ВЕТКА: КОНТРАГЕНТЫ (список папок) --- */}
                {tab === 'partners' && !selectedPartner && (
                    <div>
                        {filteredPartnerGroups.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--lc-text-ter)' }}>
                                {searchText ? 'Контрагент не найден' : 'Пока нет адресов, привязанных к контрагентам'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {filteredPartnerGroups.map(g => (
                                    <div
                                        key={g.id}
                                        className="lc-addr-folder"
                                        onClick={() => { setSelectedPartnerId(g.id); setSearchText(''); }}
                                    >
                                        <span className="lc2-avatar lc2-avatar-sm" style={{ background: '#e0f2fe', color: '#0369a1', flexShrink: 0 }}>
                                            {getInitials(g.name) || 'КГ'}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>{g.items.length} {pluralAddr(g.items.length)}</div>
                                        </div>
                                        <RightOutlined style={{ color: 'var(--lc-text-ter)', fontSize: 12 }} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- ВЕТКА: КОНТРАГЕНТЫ (внутри контрагента) --- */}
                {tab === 'partners' && selectedPartner && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => { setSelectedPartnerId(null); setSearchText(''); }}>
                                Все контрагенты
                            </Button>
                            <Space size={8}>
                                <span className="lc2-avatar lc2-avatar-sm" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                    {getInitials(selectedPartner.name) || 'КГ'}
                                </span>
                                <strong style={{ fontSize: 15 }}>{selectedPartner.name}</strong>
                                <Tag>{selectedPartner.items.length} {pluralAddr(selectedPartner.items.length)}</Tag>
                            </Space>
                            <Button
                                type="dashed"
                                icon={<PlusOutlined />}
                                onClick={() => openAdd(selectedPartner.id)}
                                style={{ marginLeft: 'auto' }}
                            >
                                Добавить адрес контрагенту
                            </Button>
                        </div>
                        <Table
                            columns={columns}
                            dataSource={filteredPartnerItems}
                            rowKey="id"
                            pagination={{ pageSize: 10, hideOnSinglePage: true }}
                            size="small"
                            locale={{ emptyText: searchText ? 'Ничего не найдено' : 'У контрагента нет адресов' }}
                        />
                    </div>
                )}
            </div>

            <Modal
                title={editingLocation ? 'Редактирование адреса' : 'Добавление нового адреса'}
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
                    setEditingLocation(null);
                    setAddForCompanyId(undefined);
                    form.resetFields();
                }}
                onOk={() => form.submit()}
                okText="Сохранить адрес"
                cancelText="Отмена"
                width={850}
                centered
                destroyOnClose
            >
                <div style={{ marginTop: 16 }}>
                    <LocationForm
                        form={form}
                        editingLocation={editingLocation}
                        defaultCompanyId={addForCompanyId}
                        onFinish={handleSubmit}
                        showCompanySelect={true}
                    />
                </div>
            </Modal>

            <style jsx>{`
                .lc-addr-folder {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    border: 1px solid var(--lc-border);
                    border-radius: 14px;
                    background: var(--lc-card);
                    cursor: pointer;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
                }
                .lc-addr-folder:hover {
                    border-color: #1677ff;
                    box-shadow: 0 8px 22px -14px rgba(22, 119, 255, 0.5);
                    transform: translateY(-1px);
                }
            `}</style>
        </div>
    );
}
