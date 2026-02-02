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
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '8px', color: '#09090b' }}>
                    Дашборд экспедитора
                </h1>
                <p style={{ color: '#71717a', fontSize: '16px' }}>
                    Обзор текущих задач и статистика
                </p>
            </div>

            <Row gutter={[24, 24]} style={{ marginBottom: 40 }}>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Всего заявок</div>
                            <FileTextOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.total}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>доступные к работе</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Ожидают назначения</div>
                            <ClockCircleOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.pending}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>требуют водителя</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">В работе</div>
                            <TruckOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.assigned}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>активные рейсы</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Завершено</div>
                            <CheckCircleOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.completed}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>выполненные заказы</div>
                    </div>
                </Col>
            </Row>

            <div className="premium-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: '#f4f4f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px'
                }}>
                    <TruckOutlined style={{ fontSize: 24, color: '#09090b' }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#09090b', marginBottom: '8px' }}>
                    Управление перевозками
                </h3>
                <p style={{ color: '#71717a', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                    Перейдите в раздел "Входящие заявки" для просмотра списка доступных грузов и назначения водителей.
                </p>
                {/* Could add a button/link here if navigation was easier to infer, 
                    but sticking to visual redesign only for now as per instructions */}
            </div>
        </div>
    );
}
