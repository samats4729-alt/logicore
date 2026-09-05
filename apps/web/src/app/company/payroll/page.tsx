'use client';

import { useEffect, useState } from 'react';
import { Table, Form, InputNumber, Select, Button, Row, Col, Modal, DatePicker, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { Plus, Table2, Target, UserRound, Wallet } from 'lucide-react';
import styles from '@/components/nova/nova.module.css';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/vocabulary';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

const { RangePicker } = DatePicker;

interface Scheme {
    id: string;
    userId: string | null;
    type: 'FIXED' | 'PERCENT' | 'HYBRID';
    fixedAmount: number;
    percentValue: number;
    percentBase: 'MARGIN' | 'ORDER_AMOUNT';
    accrualStatus: string;
    isActive: boolean;
    user?: { firstName: string; lastName: string } | null;
}

interface KpiRule {
    id: string;
    userId: string | null;
    metric: string;
    threshold: number;
    bonusAmount: number;
    user?: { firstName: string; lastName: string } | null;
}

interface User {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    role: string;
}

/**
 * Как человек подписан в списке выбора.
 *
 * Раньше рядом с именем печаталось `role` как есть: «Ербай Айжан
 * (LOGISTICIAN)». Это внутреннее слово системы, к тому же не совпадающее с
 * должностью из карточки: у человека в таблице сотрудников написано
 * «Финансист», а здесь — «LOGISTICIAN». В списке нужен человек, а не то,
 * как он назван в коде.
 *
 * Отчество печатаем, когда оно есть: полных тёзок по имени и фамилии в
 * одной компании встретить проще, чем кажется.
 */
function фио(u: User): string {
    return [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ').trim();
}

/**
 * Схема без денег бессмысленна, поэтому что-то одно заполнить надо — но
 * что именно, решает компания: кому-то оклад, кому-то процент, кому-то
 * оба. Проверка висит на обоих полях сразу и смотрит на пару, а не на
 * своё поле: иначе «укажите оклад» выскакивало бы у тех, кто платит
 * только процентом.
 */
const SCHEME_VALIDATOR = ({ getFieldValue }: any) => ({
    validator() {
        const fixed = Number(getFieldValue('fixedAmount')) || 0;
        const percent = Number(getFieldValue('percentValue')) || 0;
        if (fixed > 0 || percent > 0) return Promise.resolve();
        return Promise.reject(new Error('Укажите оклад, процент или и то и другое'));
    },
});

export default function PayrollAdminPage() {
    const [activeTab, setActiveTab] = useState('1');
    const [users, setUsers] = useState<User[]>([]);
    const [schemes, setSchemes] = useState<Scheme[]>([]);
    const [kpiRules, setKpiRules] = useState<KpiRule[]>([]);
    const [generalScheme, setGeneralScheme] = useState<Scheme | null>(null);
    const [loading, setLoading] = useState(true);

    // Report Tab states
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportData, setReportData] = useState<{
        report: any[];
        totals: { salary: number; percentTotal: number; kpiTotal: number; total: number };
    }>({ report: [], totals: { salary: 0, percentTotal: 0, kpiTotal: 0, total: 0 } });

    // Modals
    const [personalModalVisible, setPersonalModalVisible] = useState(false);
    const [kpiModalVisible, setKpiModalVisible] = useState(false);

    const [personalForm] = Form.useForm();
    const [kpiForm] = Form.useForm();
    const [generalForm] = Form.useForm();

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersRes, schemesRes, kpiRes] = await Promise.all([
                api.get('/company/users?limit=200'),
                api.get('/payroll/schemes'),
                api.get('/payroll/kpi-rules'),
            ]);

            // /company/users возвращает пагинированный объект { data, total, ... }
            const rawUsers = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.data || []);
            // Filter out drivers and recipients
            const filteredUsers = rawUsers.filter((u: User) => !['DRIVER', 'RECIPIENT'].includes(u.role));
            setUsers(filteredUsers);

            const allSchemes = schemesRes.data || [];
            setSchemes(allSchemes);
            const gen = allSchemes.find((s: Scheme) => s.userId === null);
            setGeneralScheme(gen || null);

            setKpiRules(kpiRes.data || []);
        } catch (err) {
            console.error('Failed to load payroll setup data', err);
            toast.error('Ошибка загрузки данных настроек');
        } finally {
            setLoading(false);
        }
    };

    const loadReport = async (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
        setReportLoading(true);
        try {
            const from = start.format('YYYY-MM');
            const to = end.format('YYYY-MM');
            const res = await api.get(`/payroll/report?from=${from}&to=${to}`);
            setReportData(res.data);
        } catch (err) {
            console.error('Failed to load payroll report', err);
            toast.error('Ошибка построения отчета');
        } finally {
            setReportLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    /**
     * Значения в форму подставляем, когда она уже на экране.
     *
     * Пока идёт загрузка, страница показывает кольцо ожидания, и формы
     * ещё нет. Раньше значения раскладывались прямо в `loadData` — Ant
     * Design ругался, что форма ни к чему не подключена, и подстановка
     * зависела от того, кто успел раньше.
     */
    useEffect(() => {
        if (!loading && generalScheme) generalForm.setFieldsValue(generalScheme);
    }, [loading, generalScheme, generalForm]);

    useEffect(() => {
        if (activeTab === '2' && dates[0] && dates[1]) {
            loadReport(dates[0], dates[1]);
        }
    }, [activeTab, dates]);

    /**
     * Оклад и процент — две части одной схемы, а не выбор из двух.
     *
     * Раньше в форме стоял «тип начисления» — FIXED, PERCENT или HYBRID, — и
     * поля показывались по типу. Выбрал «Оклад» — поле процента исчезало;
     * выбрал «Процент» — исчезал оклад. Заполнить и то и другое можно было
     * только через «Гибридный (HYBRID)», а по этому слову никто не догадался:
     * компания написала в поддержку, что второе поле «блокируется или не
     * сохраняется». В базе оба значения лежат всегда — мешала только форма.
     *
     * Теперь оба поля стоят рядом и заполняются свободно, а тип выводится из
     * того, что заполнено. Заводить его руками человеку незачем.
     */
    const schemeType = (values: any) => {
        const fixed = Number(values.fixedAmount) > 0;
        const percent = Number(values.percentValue) > 0;
        if (fixed && percent) return 'HYBRID';
        return percent ? 'PERCENT' : 'FIXED';
    };

    const handleSaveGeneral = async (values: any) => {
        try {
            await api.put('/payroll/schemes', { ...values, type: schemeType(values) });
            toast.success('Общая схема успешно обновлена');
            loadData();
        } catch (err) {
            console.error(err);
            toast.error('Не удалось сохранить общую схему');
        }
    };

    const handleAddPersonal = async (values: any) => {
        try {
            await api.put(`/payroll/schemes/user/${values.userId}`, { ...values, type: schemeType(values) });
            toast.success('Персональная схема создана/обновлена');
            setPersonalModalVisible(false);
            personalForm.resetFields();
            loadData();
        } catch (err) {
            console.error(err);
            toast.error('Не удалось сохранить персональную схему');
        }
    };

    const handleDeletePersonal = async (userId: string) => {
        try {
            await api.delete(`/payroll/schemes/user/${userId}`);
            toast.success('Персональная схема удалена');
            loadData();
        } catch (err) {
            console.error(err);
            toast.error('Не удалось удалить персональную схему');
        }
    };

    const handleAddKpi = async (values: any) => {
        try {
            await api.post('/payroll/kpi-rules', values);
            toast.success('KPI правило добавлено');
            setKpiModalVisible(false);
            kpiForm.resetFields();
            loadData();
        } catch (err) {
            console.error(err);
            toast.error('Не удалось добавить KPI правило');
        }
    };

    const handleDeleteKpi = async (id: string) => {
        try {
            await api.delete(`/payroll/kpi-rules/${id}`);
            toast.success('KPI правило удалено');
            loadData();
        } catch (err) {
            console.error(err);
            toast.error('Не удалось удалить KPI правило');
        }
    };

    // Columns for report table
    const reportColumns = [
        {
            title: 'Сотрудник',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => <b style={{ fontSize: 13, fontWeight: 600 }}>{text}</b>,
        },
        {
            title: 'Роль',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => <span className={styles.chip}>{ROLE_LABELS[role] || role}</span>,
        },
        {
            title: 'Завершено рейсов',
            dataIndex: 'ordersCount',
            key: 'ordersCount',
            align: 'center' as const,
            render: (count: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span>,
        },
        {
            title: 'Оклад',
            dataIndex: 'salary',
            key: 'salary',
            align: 'right' as const,
            render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString('ru-RU')} ₸</span>,
        },
        {
            title: 'Проценты',
            dataIndex: 'percentTotal',
            key: 'percentTotal',
            align: 'right' as const,
            render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString('ru-RU')} ₸</span>,
        },
        {
            title: 'Бонусы',
            dataIndex: 'kpiTotal',
            key: 'kpiTotal',
            align: 'right' as const,
            render: (v: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString('ru-RU')} ₸</span>,
        },
        {
            title: 'Всего начислено',
            dataIndex: 'total',
            key: 'total',
            align: 'right' as const,
            render: (v: number) => <span style={{ fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>{v.toLocaleString('ru-RU')} ₸</span>,
        },
    ];

    // Personal schemes table columns
    const personalColumns = [
        {
            title: 'Сотрудник',
            key: 'user',
            render: (_: any, r: Scheme) => r.user ? `${r.user.lastName || ''} ${r.user.firstName || ''}`.trim() : '—',
        },
        {
            title: 'Тип схемы',
            dataIndex: 'type',
            key: 'type',
            render: (t: string) => {
                const label = t === 'FIXED' ? 'Оклад' : t === 'PERCENT' ? 'Процент' : 'Оклад и процент';
                return <span className={styles.chip}>{label}</span>;
            },
        },
        {
            title: 'Оклад',
            dataIndex: 'fixedAmount',
            key: 'fixed',
            align: 'right' as const,
            render: (v: number) => v ? `${v.toLocaleString('ru-RU')} ₸` : '—',
        },
        {
            title: 'Процент',
            dataIndex: 'percentValue',
            key: 'percent',
            align: 'center' as const,
            render: (v: number, r: Scheme) => r.type !== 'FIXED' ? `${v}%` : '—',
        },
        {
            title: 'Процент от',
            dataIndex: 'percentBase',
            key: 'base',
            render: (b: string, r: Scheme) => {
                if (r.type === 'FIXED') return '—';
                return b === 'MARGIN' ? 'Маржа' : 'Сумма заявки';
            },
        },
        {
            title: 'Когда начисляем',
            dataIndex: 'accrualStatus',
            key: 'trigger',
            render: (t: string) => {
                if (t === 'COMPLETED') return 'Завершена';
                if (t === 'CUSTOMER_PAID') return 'Оплачена';
                return t;
            },
        },
        {
            title: 'Действия',
            key: 'actions',
            align: 'center' as const,
            render: (_: any, r: Scheme) => (
                <Popconfirm title="Удалить персональную схему и вернуть сотрудника на общую?" onConfirm={() => handleDeletePersonal(r.userId!)}>
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
            ),
        },
    ];

    // KPI rules table columns
    const kpiColumns = [
        {
            title: 'Сотрудник',
            key: 'user',
            render: (_: any, r: KpiRule) => r.user ? `${r.user.lastName || ''} ${r.user.firstName || ''}`.trim() : <span className={styles.chip}>Все сотрудники</span>,
        },
        {
            title: 'За что',
            dataIndex: 'metric',
            key: 'metric',
            render: () => 'Завершённые рейсы за месяц',
        },
        {
            title: 'Норма рейсов',
            dataIndex: 'threshold',
            key: 'threshold',
            align: 'center' as const,
        },
        {
            title: 'Размер бонуса',
            dataIndex: 'bonusAmount',
            key: 'bonus',
            align: 'right' as const,
            render: (v: number) => <span style={{ fontWeight: 700 }}>{v.toLocaleString('ru-RU')} ₸</span>,
        },
        {
            title: 'Действия',
            key: 'actions',
            align: 'center' as const,
            render: (_: any, r: KpiRule) => (
                <Popconfirm title="Удалить это KPI-правило?" onConfirm={() => handleDeleteKpi(r.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
            ),
        },
    ];

    if (loading) {
        return (
            <div className={`${styles.page} ${styles.pageWide}`}>
                <Loader size="large" full />
            </div>
        );
    }

    const personalSchemes = schemes.filter(s => s.userId !== null);

    return (
        <div className={`${styles.page} ${styles.pageWide}`}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Деньги · Зарплата</div>
                    <h1 className={styles.title}>Зарплата и мотивация</h1>
                    <p className={styles.subtitle}>
                        Кому сколько платим: оклад, процент с рейса и бонусы за месяц.
                    </p>
                </div>
                {activeTab === '2' && (
                    <div className={styles.heroActions}>
                        <RangePicker
                            picker="month"
                            value={dates}
                            onChange={(val) => {
                                if (val && val[0] && val[1]) setDates([val[0], val[1]]);
                            }}
                            allowClear={false}
                        />
                    </div>
                )}
            </div>

            {/* Переключатель разделов — те же пилюли, что в шапке кабинета и
                на «Отчётах». */}
            <div className={styles.pills} style={{ marginBottom: 14 }}>
                <button
                    type="button"
                    className={`${styles.pill} ${activeTab === '1' ? styles.pillActive : ''}`}
                    onClick={() => setActiveTab('1')}
                >
                    Схемы и бонусы
                </button>
                <button
                    type="button"
                    className={`${styles.pill} ${activeTab === '2' ? styles.pillActive : ''}`}
                    onClick={() => setActiveTab('2')}
                >
                    Сводный отчёт
                </button>
            </div>

            {activeTab === '1' ? (
                <>
                    <div className={styles.duo}>
                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <Wallet size={14} />
                                <h2 className={styles.cardTitle}>Общая схема — для всех, кому не задана своя</h2>
                            </div>
                            <div className={styles.cardBody}>
                                <Form
                                    form={generalForm}
                                    layout="vertical"
                                    onFinish={handleSaveGeneral}
                                    initialValues={{ percentBase: 'MARGIN', accrualStatus: 'COMPLETED' }}
                                >
                                    <Form.Item
                                        name="fixedAmount"
                                        label="Оклад в месяц (₸)"
                                        dependencies={['percentValue']}
                                        help="Оставьте пустым, если оклада нет"
                                        rules={[SCHEME_VALIDATOR]}
                                    >
                                        <InputNumber min={0} style={{ width: '100%' }} formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
                                    </Form.Item>

                                    <Row gutter={12}>
                                        <Col span={12}>
                                            <Form.Item
                                                name="percentValue"
                                                label="Процент с рейса (%)"
                                                dependencies={['fixedAmount']}
                                                rules={[SCHEME_VALIDATOR]}
                                            >
                                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="percentBase" label="Процент считать от" rules={[{ required: true }]}>
                                                <Select>
                                                    <Select.Option value="MARGIN">Маржи рейса</Select.Option>
                                                    <Select.Option value="ORDER_AMOUNT">Суммы рейса</Select.Option>
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                    </Row>

                                    <Form.Item name="accrualStatus" label="Когда начислять процент" rules={[{ required: true }]}>
                                        <Select>
                                            <Select.Option value="COMPLETED">Когда рейс завершён</Select.Option>
                                            <Select.Option value="CUSTOMER_PAID">Когда заказчик оплатил</Select.Option>
                                        </Select>
                                    </Form.Item>

                                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                                        <button type="submit" className={`${styles.action} ${styles.actionPrimary}`}>
                                            Сохранить
                                        </button>
                                    </Form.Item>
                                </Form>
                            </div>
                        </section>

                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <UserRound size={14} />
                                <h2 className={styles.cardTitle}>Свои условия у сотрудников</h2>
                                <span className={styles.cardCount}>{personalSchemes.length}</span>
                                <button type="button" className={styles.action} onClick={() => setPersonalModalVisible(true)}>
                                    <Plus size={14} /> Добавить
                                </button>
                            </div>
                            {personalSchemes.length === 0 ? (
                                <div className={styles.empty}>
                                    Ни у кого нет своих условий — все на общей схеме.
                                </div>
                            ) : (
                                <Table
                                    columns={personalColumns}
                                    dataSource={personalSchemes}
                                    rowKey="id"
                                    size="small"
                                    pagination={personalSchemes.length > 5 ? { pageSize: 5 } : false}
                                />
                            )}
                        </section>
                    </div>

                    <section className={styles.card} style={{ marginTop: 14 }}>
                        <div className={styles.cardHead}>
                            <Target size={14} />
                            <h2 className={styles.cardTitle}>Бонусы за месяц</h2>
                            <span className={styles.cardCount}>{kpiRules.length}</span>
                            <button type="button" className={styles.action} onClick={() => setKpiModalVisible(true)}>
                                <Plus size={14} /> Добавить
                            </button>
                        </div>
                        {kpiRules.length === 0 ? (
                            <div className={styles.empty}>
                                Бонусов нет. Бонус — это доплата, когда сотрудник закрыл за месяц
                                не меньше заданного числа рейсов.
                            </div>
                        ) : (
                            <Table
                                columns={kpiColumns}
                                dataSource={kpiRules}
                                rowKey="id"
                                size="small"
                                pagination={kpiRules.length > 5 ? { pageSize: 5 } : false}
                            />
                        )}
                    </section>
                </>
            ) : reportLoading ? (
                <Loader size="large" full />
            ) : (
                <>
                    {/* Начислено — зелёным: это единственное место, где цвет
                        разрешён поверх чёрно-белой темы. */}
                    <div className={styles.tiles}>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Всего за период</span></div>
                            <div className={`${styles.tileValue} ${styles.valuePos}`}>
                                {reportData.totals.total.toLocaleString('ru-RU')} ₸
                            </div>
                        </div>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Оклады</span></div>
                            <div className={styles.tileValue}>{reportData.totals.salary.toLocaleString('ru-RU')} ₸</div>
                        </div>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Проценты с рейсов</span></div>
                            <div className={styles.tileValue}>{reportData.totals.percentTotal.toLocaleString('ru-RU')} ₸</div>
                        </div>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Бонусы</span></div>
                            <div className={styles.tileValue}>{reportData.totals.kpiTotal.toLocaleString('ru-RU')} ₸</div>
                        </div>
                    </div>

                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <Table2 size={14} />
                            <h2 className={styles.cardTitle}>Кому сколько начислено</h2>
                            <span className={styles.cardCount}>{reportData.report.length}</span>
                        </div>
                        {reportData.report.length === 0 ? (
                            <div className={styles.empty}>
                                За выбранные месяцы начислений нет. Они появляются, когда рейс
                                доходит до статуса, заданного в схеме.
                            </div>
                        ) : (
                            <Table
                                columns={reportColumns}
                                dataSource={reportData.report}
                                rowKey="userId"
                                size="small"
                                pagination={false}
                            />
                        )}
                    </section>
                </>
            )}

            {/* Modal: Create/Edit Personal Scheme */}
            <Modal
                title="Свои условия для сотрудника"
                open={personalModalVisible}
                onCancel={() => setPersonalModalVisible(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={personalForm}
                    layout="vertical"
                    onFinish={handleAddPersonal}
                    initialValues={{ percentBase: 'MARGIN', accrualStatus: 'COMPLETED' }}
                >
                    <Form.Item name="userId" label="Сотрудник" rules={[{ required: true, message: 'Выберите сотрудника' }]}>
                        <Select showSearch placeholder="ФИО сотрудника" filterOption={(input, option) =>
                            ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
                        }>
                            {users.map(u => (
                                <Select.Option key={u.id} value={u.id} label={фио(u)}>
                                    {фио(u)}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        name="fixedAmount"
                        label="Оклад в месяц (₸)"
                        dependencies={['percentValue']}
                        help="Оставьте пустым, если оклада нет"
                        rules={[SCHEME_VALIDATOR]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="percentValue"
                                label="Процент с рейса (%)"
                                dependencies={['fixedAmount']}
                                rules={[SCHEME_VALIDATOR]}
                            >
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="percentBase" label="Процент считать от" rules={[{ required: true }]}>
                                <Select>
                                    <Select.Option value="MARGIN">Маржи рейса</Select.Option>
                                    <Select.Option value="ORDER_AMOUNT">Суммы рейса</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="accrualStatus" label="Когда начислять процент" rules={[{ required: true }]}>
                        <Select>
                            <Select.Option value="COMPLETED">Когда рейс завершён</Select.Option>
                            <Select.Option value="CUSTOMER_PAID">Когда заказчик оплатил</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item style={{ textAlign: 'right', marginTop: 24, marginBottom: 0 }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className={styles.action} onClick={() => setPersonalModalVisible(false)}>
                                Отмена
                            </button>
                            <button type="submit" className={`${styles.action} ${styles.actionPrimary}`}>
                                Сохранить
                            </button>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Create KPI Rule */}
            <Modal
                title="Бонус за месяц"
                open={kpiModalVisible}
                onCancel={() => setKpiModalVisible(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={kpiForm}
                    layout="vertical"
                    onFinish={handleAddKpi}
                    initialValues={{ metric: 'COMPLETED_ORDERS_MONTH' }}
                >
                    <Form.Item name="userId" label="Кому" help="Не выбирать — бонус получат все менеджеры">
                        <Select showSearch placeholder="Все сотрудники" allowClear filterOption={(input, option) =>
                            ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
                        }>
                            {users.map(u => (
                                <Select.Option key={u.id} value={u.id} label={фио(u)}>
                                    {фио(u)}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="metric" label="За что считаем" rules={[{ required: true }]}>
                        <Select>
                            <Select.Option value="COMPLETED_ORDERS_MONTH">Завершённые рейсы за месяц</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="threshold" label="Сколько рейсов закрыть за месяц" rules={[{ required: true, message: 'Укажите порог' }]}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="bonusAmount" label="Бонус, если норма выполнена (₸)" rules={[{ required: true, message: 'Укажите сумму бонуса' }]}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item style={{ textAlign: 'right', marginTop: 24, marginBottom: 0 }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className={styles.action} onClick={() => setKpiModalVisible(false)}>
                                Отмена
                            </button>
                            <button type="submit" className={`${styles.action} ${styles.actionPrimary}`}>
                                Сохранить
                            </button>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
