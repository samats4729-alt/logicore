'use client';

import { useEffect, useState } from 'react';
import { Typography, Card, Button, Table, Tag, Space, Alert, message, Spin, Statistic, Row, Col } from 'antd';
import { ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title, Text, Paragraph } = Typography;

interface DupUser {
    userId: string;
    personId: string | null;
    fullName: string;
    role: string;
    phone: string | null;
    iin: string | null;
    companyId: string | null;
    companyName: string | null;
}
interface DupGroup {
    reason: 'phone' | 'iin';
    key: string;
    users: DupUser[];
}
interface DupReport {
    totalGroups: number;
    totalUsersInvolved: number;
    groups: DupGroup[];
}

const ROLE_LABELS: Record<string, string> = {
    COMPANY_ADMIN: 'Администратор',
    LOGISTICIAN: 'Менеджер',
    FORWARDER: 'Экспедитор',
    ACCOUNTANT: 'Бухгалтер',
    WAREHOUSE_MANAGER: 'Завсклад',
    DRIVER: 'Водитель',
    PARTNER: 'Партнёр',
    ADMIN: 'Админ платформы',
};

export default function AdminIdentityPage() {
    const [report, setReport] = useState<DupReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [backfilling, setBackfilling] = useState(false);

    const loadReport = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/identity/duplicate-persons');
            setReport(res.data);
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось загрузить отчёт');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReport();
    }, []);

    const runBackfill = async () => {
        setBackfilling(true);
        try {
            const res = await api.post('/admin/identity/backfill-persons');
            const { total, created, alreadyLinked } = res.data || {};
            message.success(`Готово: создано личностей ${created}, уже было ${alreadyLinked}, всего пользователей ${total}`);
            loadReport();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка бэкфилла');
        } finally {
            setBackfilling(false);
        }
    };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <Title level={3} style={{ marginBottom: 4 }}>
                <TeamOutlined style={{ marginRight: 8 }} />Личности (Фаза 1)
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 20 }}>
                Новый слой «Личность» — фундамент, чтобы один физический человек не дублировался между
                компаниями. Существующие данные и логика не меняются. Слияние дубликатов здесь не выполняется —
                только показывается для вашего решения.
            </Paragraph>

            <Card style={{ marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <Text strong>Шаг 1. Создать личности</Text>
                            <div style={{ color: '#8a91a0', fontSize: 13 }}>
                                Создаёт по одной записи «Личность» на каждого пользователя (1:1), без слияния.
                                Безопасно запускать повторно.
                            </div>
                        </div>
                        <Button type="primary" loading={backfilling} onClick={runBackfill}>
                            Запустить бэкфилл
                        </Button>
                    </div>
                </Space>
            </Card>

            <Card
                title={<span>Шаг 2. Возможные дубликаты</span>}
                extra={<Button icon={<ReloadOutlined />} onClick={loadReport} loading={loading}>Обновить</Button>}
            >
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Ничего не объединяется автоматически"
                    description="Ниже — группы пользователей с одинаковым телефоном или ИИН. Это кандидаты на то, что это один и тот же человек. Слияние будет отдельным шагом только после вашего подтверждения."
                />

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                ) : report ? (
                    <>
                        <Row gutter={16} style={{ marginBottom: 16 }}>
                            <Col><Statistic title="Групп-кандидатов" value={report.totalGroups} /></Col>
                            <Col><Statistic title="Пользователей затронуто" value={report.totalUsersInvolved} /></Col>
                        </Row>

                        {report.groups.length === 0 ? (
                            <Alert type="success" showIcon message="Возможных дубликатов не найдено" />
                        ) : (
                            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                {report.groups.map((g, i) => (
                                    <Card key={i} size="small" type="inner"
                                        title={
                                            <Space>
                                                <Tag color={g.reason === 'iin' ? 'purple' : 'blue'}>
                                                    {g.reason === 'iin' ? 'Совпадает ИИН' : 'Совпадает телефон'}
                                                </Tag>
                                                <Text code>{g.key}</Text>
                                                <Text type="secondary">— {g.users.length} записи</Text>
                                            </Space>
                                        }
                                    >
                                        <Table
                                            size="small"
                                            pagination={false}
                                            rowKey="userId"
                                            dataSource={g.users}
                                            columns={[
                                                { title: 'ФИО', dataIndex: 'fullName', key: 'fullName' },
                                                { title: 'Роль', dataIndex: 'role', key: 'role', render: (r: string) => <Tag>{ROLE_LABELS[r] || r}</Tag> },
                                                { title: 'Компания', dataIndex: 'companyName', key: 'companyName', render: (c: string) => c || <Text type="secondary">—</Text> },
                                                { title: 'Телефон', dataIndex: 'phone', key: 'phone', render: (p: string) => p || '—' },
                                                { title: 'ИИН', dataIndex: 'iin', key: 'iin', render: (v: string) => v || '—' },
                                                { title: 'Личность', dataIndex: 'personId', key: 'personId', render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(-6)}</Text> : <Tag color="orange">нет</Tag> },
                                            ]}
                                        />
                                    </Card>
                                ))}
                            </Space>
                        )}
                    </>
                ) : (
                    <Alert type="warning" showIcon message="Отчёт недоступен" />
                )}
            </Card>
        </div>
    );
}
