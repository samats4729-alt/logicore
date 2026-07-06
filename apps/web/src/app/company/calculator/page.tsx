'use client';

import { useState } from 'react';
import { Space, Row, Col, Divider, InputNumber } from 'antd';
import { CalculatorOutlined, DollarOutlined, FireOutlined, CarOutlined, PercentageOutlined } from '@ant-design/icons';

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

    const fmt = (n: number) => n.toLocaleString('ru-RU');

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Финансы · Расчёты</div>
                    <h1 className="lc2-title">Калькулятор рентабельности рейса</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Быстрый расчет маржинальности и рентабельности перевозки
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                            <DollarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Выручка</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#52c41a' }}>
                                {fmt(revenue)} ₸
                            </div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6f7ff', color: '#1890ff' }}>
                            <PercentageOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Маржа</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: margin >= 0 ? '#28a745' : '#dc3545' }}>
                                {fmt(margin)} ₸
                            </div>
                            <div className="lc2-msub">
                                {profitability}% рентабельность
                            </div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#fff7e6', color: '#fa8c16' }}>
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Расстояние</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {fmt(distance)} км
                            </div>
                            <div className="lc2-msub">
                                ставка {fmt(rate)} ₸/км
                            </div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#ffeef0', color: '#dc3545' }}>
                            <FireOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Расходы</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#ff4d4f' }}>
                                {fmt(totalCosts)} ₸
                            </div>
                            <div className="lc2-msub">
                                топливо {fmt(fuelTotal)} ₸
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CONTENT ===== */}
            <Row gutter={[24, 24]}>
                <Col xs={24} md={12}>
                    <div className="lc-card" style={{ padding: 20 }}>
                        <h4 style={{ fontWeight: 600, margin: '0 0 4px' }}>Параметры рейса</h4>
                        <span style={{ color: 'var(--lc-text-ter)', fontSize: 13 }}>Исходные данные для расчёта</span>
                        <div style={{ marginTop: 18 }}>
                            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                <div>
                                    <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--lc-text-ter)' }}>Расстояние (км)</span></div>
                                    <InputNumber value={distance} onChange={v => setDistance(v || 0)} style={{ width: '100%' }} min={0} />
                                </div>
                                <div>
                                    <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--lc-text-ter)' }}>Ставка за км (₸)</span></div>
                                    <InputNumber value={rate} onChange={v => setRate(v || 0)} style={{ width: '100%' }} min={0} />
                                </div>
                            </Space>
                        </div>
                    </div>
                    <div className="lc-card" style={{ padding: 20, marginTop: 16 }}>
                        <h4 style={{ fontWeight: 600, margin: '0 0 4px' }}>Затраты</h4>
                        <span style={{ color: 'var(--lc-text-ter)', fontSize: 13 }}>Расходы на выполнение рейса</span>
                        <div style={{ marginTop: 18 }}>
                            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                <div>
                                    <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--lc-text-ter)' }}>Цена топлива (₸/л)</span></div>
                                    <InputNumber value={fuelCost} onChange={v => setFuelCost(v || 0)} style={{ width: '100%' }} min={0} />
                                </div>
                                <div>
                                    <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--lc-text-ter)' }}>Расход (л/100км)</span></div>
                                    <InputNumber value={fuelConsumption} onChange={v => setFuelConsumption(v || 0)} style={{ width: '100%' }} min={0} />
                                </div>
                                <div>
                                    <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--lc-text-ter)' }}>Доп. расходы (₸)</span></div>
                                    <InputNumber value={extraCosts} onChange={v => setExtraCosts(v || 0)} style={{ width: '100%' }} min={0} />
                                </div>
                            </Space>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="lc-card" style={{ padding: 20 }}>
                        <h4 style={{ fontWeight: 600, margin: '0 0 4px' }}>Результат расчета</h4>
                        <span style={{ color: 'var(--lc-text-ter)', fontSize: 13 }}>Итоговые показатели рейса</span>
                        <div style={{ padding: '8px 0', marginTop: 12 }}>
                            <div className="lc2-mlabel">Выручка</div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', fontVariantNumeric: 'tabular-nums' }}>
                                {fmt(revenue)} ₸
                            </div>
                        </div>
                        <Divider style={{ margin: '16px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                            <span style={{ color: 'var(--lc-text-ter)' }}>Топливо</span>
                            <span style={{ fontWeight: 600, color: '#ff4d4f' }}>-{fmt(fuelTotal)} ₸</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                            <span style={{ color: 'var(--lc-text-ter)' }}>Доп. расходы</span>
                            <span style={{ fontWeight: 600, color: '#ff4d4f' }}>-{fmt(extraCosts)} ₸</span>
                        </div>
                        <Divider style={{ margin: '16px 0' }} />
                        <div style={{ padding: '8px 0' }}>
                            <div className="lc2-mlabel">Маржа</div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: margin >= 0 ? '#52c41a' : '#ff4d4f', fontVariantNumeric: 'tabular-nums' }}>
                                {fmt(margin)} ₸
                            </div>
                        </div>
                        <div style={{ padding: '8px 0' }}>
                            <div className="lc2-mlabel">Рентабельность</div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: margin >= 0 ? '#52c41a' : '#ff4d4f' }}>
                                {profitability}%
                            </div>
                        </div>
                    </div>
                </Col>
            </Row>
        </div>
    );
}
