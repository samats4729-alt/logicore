'use client';

import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography } from 'antd';
import {
    FileTextOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    TruckOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title } = Typography;

interface Stats {
    total: number;
    pending: number;
    assigned: number;
    completed: number;
}

export default function ForwarderDashboard() {
    const [stats, setStats] = useState<Stats>({
        total: 0,
        pending: 0,
        assigned: 0,
        completed: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await api.get('/forwarder/stats');
                setStats(response.data);
            } catch (error) {
                console.error('Failed to fetch stats:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    return (
        <div>
            <Title level={3}>Дашборд экспедитора</Title>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="Всего заявок"
                            value={stats.total}
                            prefix={<FileTextOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="Ожидают назначения"
                            value={stats.pending}
                            prefix={<ClockCircleOutlined />}
                            valueStyle={{ color: '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="В работе"
                            value={stats.assigned}
                            prefix={<TruckOutlined />}
                            valueStyle={{ color: '#1677ff' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card loading={loading}>
                        <Statistic
                            title="Завершено"
                            value={stats.completed}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
            </Row>

            <Card>
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                    <TruckOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                    <div>Перейдите в раздел "Входящие заявки" для просмотра назначенных перевозок</div>
                </div>
            </Card>
        </div>
    );
}
