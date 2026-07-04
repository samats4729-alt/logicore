'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Table, Card, Button, Space, Modal, Form,
    Input, Typography, App, Select, Tag, Tooltip
} from 'antd';
import { 
    PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined,
    SearchOutlined, ClearOutlined, MailOutlined, UserOutlined, GlobalOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import LocationForm from '@/components/ui/LocationForm';

const { Title, Text } = Typography;
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

    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            width: 170,
            render: (text: string) => (
                <Space>
                    <EnvironmentOutlined style={{ color: '#1677ff' }} />
                    <strong style={{ whiteSpace: 'nowrap' }}>{text}</strong>
                </Space>
            ),
        },
        {
            title: 'Адрес',
            dataIndex: 'address',
            key: 'address',
            width: 250,
            render: (text: string) => (
                <Tooltip title={text} placement="topLeft">
                    <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {text || '—'}
                    </span>
                </Tooltip>
            ),
        },
        {
            title: 'Контрагент',
            dataIndex: 'company',
            key: 'company',
            width: 170,
            render: (company: any) => {
                if (!company) return <Tag icon={<GlobalOutlined />} color="default" style={{ margin: 0 }}>Общий адрес</Tag>;
                return (
                    <Tooltip title={company.name}>
                        <Tag color="geekblue" style={{ fontWeight: 500, margin: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {company.name}
                        </Tag>
                    </Tooltip>
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
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {record.latitude?.toFixed(4)}, {record.longitude?.toFixed(4)}
                </Text>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 100,
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

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>Адреса</Title>
                    <Text type="secondary">Управление точками погрузки и выгрузки</Text>
                </div>
                <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => {
                    setEditingLocation(null);
                    form.resetFields();
                    setModalOpen(true);
                }}>
                    Добавить новый адрес
                </Button>
            </div>

            <Card bordered={false} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
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
                        {companies.map(c => (
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
                />
            </Card>

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
