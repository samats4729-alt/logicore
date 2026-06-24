'use client';

import { useState } from 'react';
import { Card, Space, Typography, Row, Col, Divider, Statistic, InputNumber } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function CalculatorPage() {
    const [distance, setDistance] = useState(1200);
    const [rate, setRate] = useState(250);
    const [fuelCost, setFuelCost] = useState(180);
    const [fuelConsumption, setFuelConsumption] = useState(30);
    const [extraCosts, setExtraCosts] = useState(50000);

    const revenue = distance * rate;
    const fuelTotal = (distance / 100) * fuelConsumption * fuelCost;
    const totalCosts = fuelTotal + extraCosts;
    const margin = revenue - totalCosts;
    const profitability = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '8px', color: '#09090b' }}>
                    <CalculatorOutlined style={{ marginRight: 12 }} />Калькулятор рентабельности рейса
                </h1>
                <p style={{ color: '#71717a', fontSize: '16px' }}>
                    Быстрый расчет маржинальности и рентабельности перевозки
                </p>
            </div>

            <Row gutter={[24, 24]}>
                <Col xs={24} md={12}>
                    <Card 
                        size="small" 
                        title={<span style={{ fontWeight: 600 }}>Параметры рейса</span>} 
                        style={{ marginBottom: 20, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <div>
                                <div style={{ marginBottom: 6 }}><Text type="secondary">Расстояние (км)</Text></div>
                                <InputNumber value={distance} onChange={v => setDistance(v || 0)} style={{ width: '100%' }} min={0} />
                            </div>
                            <div>
                                <div style={{ marginBottom: 6 }}><Text type="secondary">Ставка за км (₸)</Text></div>
                                <InputNumber value={rate} onChange={v => setRate(v || 0)} style={{ width: '100%' }} min={0} />
                            </div>
                        </Space>
                    </Card>
                    <Card 
                        size="small" 
                        title={<span style={{ fontWeight: 600 }}>Затраты</span>}
                        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <div>
                                <div style={{ marginBottom: 6 }}><Text type="secondary">Цена топлива (₸/л)</Text></div>
                                <InputNumber value={fuelCost} onChange={v => setFuelCost(v || 0)} style={{ width: '100%' }} min={0} />
                            </div>
                            <div>
                                <div style={{ marginBottom: 6 }}><Text type="secondary">Расход (л/100км)</Text></div>
                                <InputNumber value={fuelConsumption} onChange={v => setFuelConsumption(v || 0)} style={{ width: '100%' }} min={0} />
                            </div>
                            <div>
                                <div style={{ marginBottom: 6 }}><Text type="secondary">Доп. расходы (₸)</Text></div>
                                <InputNumber value={extraCosts} onChange={v => setExtraCosts(v || 0)} style={{ width: '100%' }} min={0} />
                            </div>
                        </Space>
                    </Card>
                </Col>
                <Col xs={24} md={12}>
                    <Card 
                        size="small" 
                        title={<span style={{ fontWeight: 600 }}>Результат расчета</span>}
                        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
                    >
                        <div style={{ padding: '8px 0' }}>
                            <Statistic title="Выручка" value={revenue} suffix="₸" valueStyle={{ color: '#52c41a', fontWeight: 700 }} />
                        </div>
                        <Divider style={{ margin: '16px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                            <Text type="secondary">Топливо</Text>
                            <Text strong style={{ color: '#ff4d4f' }}>-{fuelTotal.toLocaleString('ru-RU')} ₸</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                            <Text type="secondary">Доп. расходы</Text>
                            <Text strong style={{ color: '#ff4d4f' }}>-{extraCosts.toLocaleString('ru-RU')} ₸</Text>
                        </div>
                        <Divider style={{ margin: '16px 0' }} />
                        <div style={{ padding: '8px 0' }}>
                            <Statistic title="Маржа" value={margin} suffix="₸" valueStyle={{ color: margin >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }} />
                        </div>
                        <div style={{ padding: '8px 0' }}>
                            <Statistic title="Рентабельность" value={profitability} suffix="%" valueStyle={{ color: margin >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 18 }} />
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
