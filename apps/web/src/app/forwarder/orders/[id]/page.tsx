'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Typography, Tag, Button, Descriptions, Card, Row, Col, Statistic, Table,
    Modal, Form, Input, InputNumber, Select, DatePicker, message, Timeline, Space, Spin, Divider, Popconfirm, Upload
} from 'antd';
import {
    ArrowLeftOutlined, PlusOutlined, EnvironmentOutlined, FlagOutlined,
    DollarOutlined, WalletOutlined, CheckCircleOutlined, ClockCircleOutlined,
    EditOutlined, DeleteOutlined, FilePdfOutlined, UploadOutlined,
    UserAddOutlined, UserDeleteOutlined, HistoryOutlined, TeamOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const statusColors: Record<string, string> = {
    DRAFT: 'default', PENDING: 'orange', ASSIGNED: 'blue',
    EN_ROUTE_PICKUP: 'gold', AT_PICKUP: 'lime', LOADING: 'purple',
    IN_TRANSIT: 'cyan', AT_DELIVERY: 'lime', UNLOADING: 'purple',
    COMPLETED: 'green', PROBLEM: 'red', CANCELLED: '#f5222d',
};

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик', PENDING: 'Ожидает', ASSIGNED: 'Назначен',
    EN_ROUTE_PICKUP: 'Едет на погр.', AT_PICKUP: 'На погрузке', LOADING: 'Загрузка',
    IN_TRANSIT: 'В пути', AT_DELIVERY: 'На выгрузке', UNLOADING: 'Разгрузка',
    COMPLETED: 'Завершён', PROBLEM: 'Проблема', CANCELLED: 'Отменён',
};

const expenseCategories = [
    { value: 'fuel', label: 'Топливо' },
    { value: 'repair', label: 'Ремонт' },
    { value: 'salary', label: 'Зарплата' },
    { value: 'insurance', label: 'Страховка' },
    { value: 'penalties', label: 'Штрафы' },
    { value: 'driver_payment', label: 'Оплата водителю' },
    { value: 'other', label: 'Прочее' },
];

const incomeCategories = [
    { value: 'order_payment', label: 'Оплата по заявке' },
    { value: 'prepayment', label: 'Предоплата' },
    { value: 'refund', label: 'Возврат' },
    { value: 'other', label: 'Прочее' },
];

export default function OrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;
    const { user: currentUser } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const [uploadingDoc, setUploadingDoc] = useState(false);

    // Income modal
    const [incomeModalOpen, setIncomeModalOpen] = useState(false);
    const [incomeForm] = Form.useForm();
    const [incomeLoading, setIncomeLoading] = useState(false);

    // Expense modal
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseForm] = Form.useForm();
    const [expenseLoading, setExpenseLoading] = useState(false);

    const fetchData = async () => {
        try {
            const res = await api.get(`/accounting/orders/${orderId}/financials`);
            setData(res.data);
        } catch (err: any) {
            message.error('Не удалось загрузить заявку');
        } finally {
            setLoading(false);
        }
    };

    const fetchDocuments = async () => {
        try {
            const res = await api.get(`/documents/order/${orderId}`);
            setDocuments(res.data);
        } catch { }
    };

    useEffect(() => { fetchData(); fetchDocuments(); }, [orderId]);

    const customUploadTTN = async (options: any) => {
        const { file, onSuccess, onError } = options;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'TTN');

        setUploadingDoc(true);
        try {
            await api.post(`/documents/upload/${orderId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            message.success('ТТН успешно загружена');
            onSuccess("ok");
            fetchDocuments();
        } catch (err) {
            message.error('Ошибка загрузки документа');
            onError(err);
        } finally {
            setUploadingDoc(false);
        }
    };

    const handleDownloadDoc = async (doc: any) => {
        try {
            const response = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', doc.fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch (error) {
            message.error('Ошибка при скачивании файла');
        }
    };

    const handleAddIncome = async (values: any) => {
        setIncomeLoading(true);
        try {
            const label = incomeCategories.find(c => c.value === values.category)?.label || values.category;
            await api.post('/accounting/incomes', {
                ...values,
                description: label,
                date: values.date.toISOString(),
                orderId,
            });
            message.success('Поступление добавлено');
            setIncomeModalOpen(false);
            incomeForm.resetFields();
            fetchData();
        } catch { message.error('Ошибка'); }
        finally { setIncomeLoading(false); }
    };

    const handleAddExpense = async (values: any) => {
        setExpenseLoading(true);
        try {
            const label = expenseCategories.find(c => c.value === values.category)?.label || values.category;
            await api.post('/accounting/expenses', {
                ...values,
                description: label,
                date: values.date.toISOString(),
                orderId,
            });
            message.success('Расход добавлен');
            setExpenseModalOpen(false);
            expenseForm.resetFields();
            fetchData();
        } catch { message.error('Ошибка'); }
        finally { setExpenseLoading(false); }
    };

    const handleDeleteIncome = async (id: string) => {
        try {
            await api.delete(`/accounting/incomes/${id}`);
            message.success('Удалено');
            fetchData();
        } catch { message.error('Ошибка удаления'); }
    };

    const handleDeleteExpense = async (id: string) => {
        try {
            await api.delete(`/accounting/expenses/${id}`);
            message.success('Удалено');
            fetchData();
        } catch { message.error('Ошибка удаления'); }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 80 }}>Заявка не найдена</div>;

    const { order, incomes, expenses, summary } = data;

    const isAssigned = order.assignees?.some((a: any) => a.user.id === currentUser?.id);

    const handleAssignMe = async () => {
        try {
            await api.put(`/forwarder/orders/${orderId}/assign-me`);
            message.success('Вы взяли заявку в работу');
            fetchData();
        } catch { message.error('Ошибка'); }
    };

    const handleUnassignMe = async () => {
        try {
            await api.delete(`/forwarder/orders/${orderId}/unassign-me`);
            message.success('Вы открепились от заявки');
            fetchData();
        } catch { message.error('Ошибка'); }
    };

    const fmt = (n: number) => n.toLocaleString('ru-RU');

    const incomeColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{dayjs(d).format('DD.MM.YY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'cat', width: 140, render: (c: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{incomeCategories.find(x => x.value === c)?.label || c}</Text> },
        { title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const, render: (a: number, r: any) => <Text delete={r.isDeleted} strong style={{ color: r.isDeleted ? '#bfbfbf' : '#389e0d' }}>{fmt(a)}</Text> },
        { title: '', key: 'actions', width: 50, render: (_: any, r: any) => (
            !r.isDeleted && <Popconfirm title="Точно хотите удалить?" onConfirm={() => handleDeleteIncome(r.id)} okText="Да" cancelText="Нет"><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        )},
    ];

    const expenseColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{dayjs(d).format('DD.MM.YY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'cat', width: 140, render: (c: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{expenseCategories.find(x => x.value === c)?.label || c}</Text> },
        { title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const, render: (a: number, r: any) => <Text delete={r.isDeleted} strong style={{ color: r.isDeleted ? '#bfbfbf' : '#cf1322' }}>{fmt(a)}</Text> },
        { title: '', key: 'actions', width: 50, render: (_: any, r: any) => (
            !r.isDeleted && <Popconfirm title="Точно хотите удалить?" onConfirm={() => handleDeleteExpense(r.id)} okText="Да" cancelText="Нет"><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        )},
    ];

    const docColumns = [
        { title: 'Тип', dataIndex: 'type', key: 'type', width: 100, render: (t: string) => t === 'TTN' ? 'ТТН' : t },
        { title: 'Файл', dataIndex: 'fileName', key: 'fileName' },
        { title: 'Размер', dataIndex: 'fileSize', key: 'size', width: 100, render: (s: number) => `${(s / 1024).toFixed(1)} KB` },
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 130, render: (d: string) => dayjs(d).format('DD.MM.YY HH:mm') },
        { title: '', key: 'action', width: 80, render: (_: any, r: any) => (
            <Button size="small" type="link" onClick={() => handleDownloadDoc(r)}>Скачать</Button>
        )}
    ];

    const pickupCity = order.pickupLocation?.city || order.pickupLocation?.name || '';
    const deliveryCity = order.deliveryPoints?.[0]?.location?.city || order.deliveryPoints?.[0]?.location?.name || '';

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} />
                <div style={{ flex: 1 }}>
                    <Title level={4} style={{ margin: 0 }}>
                        Заявка {order.orderNumber}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        от {dayjs(order.createdAt).format('DD.MM.YYYY')}
                    </Text>
                </div>
                <Tag color={statusColors[order.status]} style={{ fontSize: 14, padding: '4px 12px' }}>
                    {statusLabels[order.status] || order.status}
                </Tag>
            </div>

            {/* ORDER INFO */}
            <Row gutter={[16, 16]}>
                <Col span={12}>
                    <Card size="small" title="Маршрут и Груз" style={{ height: '100%' }}>
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <EnvironmentOutlined style={{ color: '#1890ff' }} />
                                <Text strong>{pickupCity}</Text>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12, paddingLeft: 22 }}>{order.pickupLocation?.address}</Text>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <FlagOutlined style={{ color: '#52c41a' }} />
                                <Text strong>{deliveryCity}</Text>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12, paddingLeft: 22 }}>{order.deliveryPoints?.[0]?.location?.address}</Text>
                        </div>
                        <Divider style={{ margin: '8px 0' }} />
                        <Descriptions size="small" column={2}>
                            <Descriptions.Item label="Груз">{order.cargoDescription || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Характер">{order.natureOfCargo || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Вес">{order.cargoWeight ? `${order.cargoWeight} кг` : '—'}</Descriptions.Item>
                            <Descriptions.Item label="Объём">{order.cargoVolume ? `${order.cargoVolume} м³` : '—'}</Descriptions.Item>
                            <Descriptions.Item label="Кузов">{order.cargoType || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Дата погр.">{order.pickupDate ? dayjs(order.pickupDate).format('DD.MM.YY HH:mm') : '—'}</Descriptions.Item>
                        </Descriptions>
                    </Card>
                </Col>
                <Col span={12}>
                    <Card size="small" title={<span><TeamOutlined style={{ marginRight: 6 }} />Участники</span>} style={{ height: '100%' }}>
                        <Descriptions size="small" column={1}>
                            <Descriptions.Item label="Заказчик">{order.customerCompany?.name || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Контакт">{order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : '—'}</Descriptions.Item>
                            <Descriptions.Item label="Телефон">{order.customer?.phone || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Водитель">{order.assignedDriverName || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Гос. номер">{order.assignedDriverPlate || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Экспедитор">{order.forwarder?.name || '—'}</Descriptions.Item>
                            {order.subForwarder && (
                                <Descriptions.Item label="Суб-экспедитор">{order.subForwarder.name}</Descriptions.Item>
                            )}
                            {order.responsibleManager && (
                                <Descriptions.Item label="Ответственный">{order.responsibleManager.firstName} {order.responsibleManager.lastName}</Descriptions.Item>
                            )}
                        </Descriptions>

                        {/* МЕНЕДЖЕРЫ НА ЗАЯВКЕ */}
                        <Divider style={{ margin: '12px 0 8px' }} />
                        <div style={{ marginBottom: 8 }}>
                            <Text strong style={{ fontSize: 13 }}>Менеджеры на заявке:</Text>
                        </div>
                        <Space wrap style={{ marginBottom: 8 }}>
                            {order.assignees?.length > 0 ? order.assignees.map((a: any) => (
                                <Tag key={a.id} color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>
                                    {a.user.firstName} {a.user.lastName}
                                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                                        {dayjs(a.assignedAt).format('DD.MM HH:mm')}
                                    </Text>
                                </Tag>
                            )) : (
                                <Text type="secondary" style={{ fontSize: 12 }}>Никто ещё не взял в работу</Text>
                            )}
                        </Space>
                        <div>
                            {isAssigned ? (
                                <Button size="small" danger icon={<UserDeleteOutlined />} onClick={handleUnassignMe}>Открепиться</Button>
                            ) : (
                                <Button size="small" type="primary" icon={<UserAddOutlined />} onClick={handleAssignMe}>Взять в работу</Button>
                            )}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* FINANCIAL SUMMARY */}
            <Card size="small" style={{ marginTop: 16 }}>
                <Row gutter={16}>
                    <Col span={4}>
                        <Statistic
                            title="Цена заказчика"
                            value={summary.customerPrice}
                            suffix="₸"
                            valueStyle={{ fontSize: 18, fontWeight: 600 }}
                        />
                        <Tag color={summary.isCustomerPaid ? 'green' : 'orange'} style={{ marginTop: 4 }}>
                            {summary.isCustomerPaid ? 'Оплачено' : 'Не оплачено'}
                        </Tag>
                    </Col>
                    <Col span={4}>
                        <Statistic
                            title="Оплата водителю"
                            value={summary.driverCost}
                            suffix="₸"
                            valueStyle={{ fontSize: 18, fontWeight: 600 }}
                        />
                        <Tag color={summary.isDriverPaid ? 'green' : 'orange'} style={{ marginTop: 4 }}>
                            {summary.isDriverPaid ? 'Оплачено' : 'Не оплачено'}
                        </Tag>
                    </Col>
                    <Col span={4}>
                        <Statistic
                            title="Маржа"
                            value={summary.margin}
                            suffix="₸"
                            valueStyle={{ fontSize: 18, fontWeight: 600, color: summary.margin >= 0 ? '#389e0d' : '#cf1322' }}
                        />
                    </Col>
                    <Col span={4}>
                        <Statistic
                            title="Поступления"
                            value={summary.totalIncomes}
                            suffix="₸"
                            valueStyle={{ fontSize: 18, color: '#389e0d' }}
                            prefix={<WalletOutlined />}
                        />
                    </Col>
                    <Col span={4}>
                        <Statistic
                            title="Расходы"
                            value={summary.totalExpenses}
                            suffix="₸"
                            valueStyle={{ fontSize: 18, color: '#cf1322' }}
                            prefix={<DollarOutlined />}
                        />
                    </Col>
                    <Col span={4}>
                        <Statistic
                            title="Долг заказчика"
                            value={summary.customerDebt}
                            suffix="₸"
                            valueStyle={{ fontSize: 18, color: summary.customerDebt > 0 ? '#faad14' : '#389e0d' }}
                        />
                    </Col>
                </Row>
            </Card>

            {/* INCOMES TABLE */}
            <Card
                size="small"
                title={<span><WalletOutlined style={{ color: '#389e0d', marginRight: 6 }} />Поступления ({incomes.length})</span>}
                extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { incomeForm.resetFields(); incomeForm.setFieldsValue({ date: dayjs() }); setIncomeModalOpen(true); }}>Добавить</Button>}
                style={{ marginTop: 16 }}
            >
                <Table
                    columns={incomeColumns}
                    dataSource={incomes}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{ emptyText: 'Нет поступлений' }}
                />
            </Card>

            {/* EXPENSES TABLE */}
            <Card
                size="small"
                title={<span><DollarOutlined style={{ color: '#cf1322', marginRight: 6 }} />Расходы ({expenses.length})</span>}
                extra={<Button size="small" type="primary" danger icon={<PlusOutlined />} onClick={() => { expenseForm.resetFields(); expenseForm.setFieldsValue({ date: dayjs() }); setExpenseModalOpen(true); }}>Добавить</Button>}
                style={{ marginTop: 16 }}
            >
                <Table
                    columns={expenseColumns}
                    dataSource={expenses}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{ emptyText: 'Нет расходов' }}
                />
            </Card>

            {/* DOCUMENTS TABLE */}
            <Card
                size="small"
                title={<span><FilePdfOutlined style={{ color: '#1890ff', marginRight: 6 }} />Документы ({documents.length})</span>}
                extra={
                    <Upload customRequest={customUploadTTN} showUploadList={false}>
                        <Button size="small" type="primary" icon={<UploadOutlined />} loading={uploadingDoc}>Загрузить ТТН</Button>
                    </Upload>
                }
                style={{ marginTop: 16 }}
            >
                <Table
                    columns={docColumns}
                    dataSource={documents}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{ emptyText: 'Нет документов' }}
                />
            </Card>

            {/* STATUS HISTORY */}
            {order.statusHistory && order.statusHistory.length > 0 && (
                <Card size="small" title="История статусов" style={{ marginTop: 16 }}>
                    <Timeline
                        items={order.statusHistory.map((h: any) => ({
                            color: h.status === 'COMPLETED' ? 'green' : h.status === 'PROBLEM' ? 'red' : 'blue',
                            children: (
                                <div>
                                    <Tag color={statusColors[h.status]}>{statusLabels[h.status] || h.status}</Tag>
                                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                        {dayjs(h.changedAt).format('DD.MM.YY HH:mm')}
                                    </Text>
                                    {h.comment && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{h.comment}</div>}
                                </div>
                            ),
                        }))}
                    />
                </Card>
            )}

            {/* CHANGE LOG */}
            {order.changeLog && order.changeLog.length > 0 && (
                <Card size="small" title={<span><HistoryOutlined style={{ marginRight: 6 }} />Лог изменений</span>} style={{ marginTop: 16, marginBottom: 24 }}>
                    <Timeline
                        items={order.changeLog.map((log: any) => ({
                            color: log.action.includes('assigned') ? 'green' : log.action.includes('unassigned') ? 'red' : 'blue',
                            children: (
                                <div>
                                    <Text strong style={{ fontSize: 13 }}>{log.user.firstName} {log.user.lastName}</Text>
                                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                        {dayjs(log.createdAt).format('DD.MM.YY HH:mm')}
                                    </Text>
                                    {log.details && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{log.details}</div>}
                                </div>
                            ),
                        }))}
                    />
                </Card>
            )}

            {/* INCOME MODAL */}
            <Modal
                title="Добавить поступление"
                open={incomeModalOpen}
                onCancel={() => setIncomeModalOpen(false)}
                onOk={() => incomeForm.submit()}
                okText="Добавить"
                cancelText="Отмена"
                confirmLoading={incomeLoading}
            >
                <Form form={incomeForm} layout="vertical" onFinish={handleAddIncome}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}>
                        <Select options={incomeCategories} />
                    </Form.Item>

                    <Form.Item name="amount" label="Сумма ₸" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                    <Form.Item name="note" label="Примечание">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* EXPENSE MODAL */}
            <Modal
                title="Добавить расход"
                open={expenseModalOpen}
                onCancel={() => setExpenseModalOpen(false)}
                onOk={() => expenseForm.submit()}
                okText="Добавить"
                cancelText="Отмена"
                confirmLoading={expenseLoading}
            >
                <Form form={expenseForm} layout="vertical" onFinish={handleAddExpense}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}>
                        <Select options={expenseCategories} />
                    </Form.Item>

                    <Form.Item name="amount" label="Сумма ₸" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                    <Form.Item name="note" label="Примечание">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
