'use client';

import { useEffect, useState } from 'react';
import { Typography, Card, Button, Table, Tag, Space, Alert, message, Spin, Statistic, Row, Col, Select, Popconfirm } from 'antd';
import { ReloadOutlined, TeamOutlined, MergeCellsOutlined } from '@ant-design/icons';
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

interface MergeRow {
    mergeId: string;
    createdAt: string;
    targetName: string;
    mergedCount: number;
    users: { userId: string; fullName: string; companyName: string | null }[];
}

interface AffOverview {
    totalAffiliations: number;
    totalPersons: number;
    multiCompanyCount: number;
    multiCompanyPersons: { personId: string; fullName: string; companyCount: number; companies: { name: string; roles: string[] }[] }[];
}

interface VehOverview {
    total: number;
    linkedToDriver: number;
    sample: { plate: string; model: string; company: string; driver: string | null }[];
}

interface Reconcile {
    ok: boolean;
    persons: { activeUsers: number; withPerson: number; withoutPerson: number; withoutPersonSample: { userId: string; fullName: string }[] };
    affiliations: { expected: number; inNew: number; missingInNew: number; extraInNew: number; missingSample: { person: string; company: string; role: string }[]; extraSample: { person: string; company: string; role: string }[] };
    vehicles: { total: number; expectedLinks: number; linkedOk: number; missingLinks: number; mismatched: number; missingSample: string[]; mismatchSample: string[] };
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
    // Выбор для слияния: ключ группы -> выбранные userId; и ключ группы -> userId «основной»
    const [sel, setSel] = useState<Record<string, string[]>>({});
    const [surv, setSurv] = useState<Record<string, string>>({});
    const [merging, setMerging] = useState<string | null>(null);
    const [history, setHistory] = useState<MergeRow[]>([]);
    const [reverting, setReverting] = useState<string | null>(null);
    const [aff, setAff] = useState<AffOverview | null>(null);
    const [backfillingAff, setBackfillingAff] = useState(false);
    const [veh, setVeh] = useState<VehOverview | null>(null);
    const [backfillingVeh, setBackfillingVeh] = useState(false);
    const [recon, setRecon] = useState<Reconcile | null>(null);
    const [reconLoading, setReconLoading] = useState(false);

    const loadRecon = async () => {
        setReconLoading(true);
        try {
            const res = await api.get('/admin/identity/reconcile');
            setRecon(res.data);
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось выполнить сверку');
        } finally {
            setReconLoading(false);
        }
    };

    const loadVeh = async () => {
        try {
            const res = await api.get('/admin/identity/vehicles-overview');
            setVeh(res.data);
        } catch {
            /* обзор недоступен — не критично */
        }
    };

    const runBackfillVeh = async () => {
        setBackfillingVeh(true);
        try {
            const res = await api.post('/admin/identity/backfill-vehicle-drivers');
            message.success(`Транспорт: связано машин с водителями ${res.data?.linked ?? 0} из ${res.data?.candidates ?? 0}`);
            loadVeh();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка бэкфилла транспорта');
        } finally {
            setBackfillingVeh(false);
        }
    };

    const loadAff = async () => {
        try {
            const res = await api.get('/admin/identity/affiliations-overview');
            setAff(res.data);
        } catch {
            /* обзор недоступен — не критично */
        }
    };

    const runBackfillAff = async () => {
        setBackfillingAff(true);
        try {
            const res = await api.post('/admin/identity/backfill-affiliations');
            const { created, desired, skippedUsersWithoutPerson } = res.data || {};
            message.success(`Членство: создано ${created} из ${desired}${skippedUsersWithoutPerson ? `, пропущено без личности ${skippedUsersWithoutPerson}` : ''}`);
            loadAff();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка бэкфилла членства');
        } finally {
            setBackfillingAff(false);
        }
    };

    const loadHistory = async () => {
        try {
            const res = await api.get('/admin/identity/merges');
            setHistory(res.data || []);
        } catch {
            /* история недоступна — не критично */
        }
    };

    const revertMerge = async (mergeId: string) => {
        setReverting(mergeId);
        try {
            const res = await api.post(`/admin/identity/merges/${mergeId}/revert`);
            message.success(`Разъединено: возвращено пользователей ${res.data?.restoredUsers ?? 0}, восстановлено личностей ${res.data?.restoredPersons ?? 0}`);
            loadHistory();
            loadReport();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка отката');
        } finally {
            setReverting(null);
        }
    };

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
        loadHistory();
        loadAff();
        loadVeh();
        loadRecon();
    }, []);

    const mergeGroup = async (g: DupGroup, gk: string) => {
        const selectedUserIds = sel[gk] || [];
        const selectedUsers = g.users.filter(u => selectedUserIds.includes(u.userId) && u.personId);
        if (selectedUsers.length < 2) {
            message.warning('Выберите минимум две записи одного человека');
            return;
        }
        const survivorUserId = surv[gk] && selectedUsers.some(u => u.userId === surv[gk]) ? surv[gk] : selectedUsers[0].userId;
        const survivor = selectedUsers.find(u => u.userId === survivorUserId)!;
        const sourcePersonIds = Array.from(new Set(
            selectedUsers.filter(u => u.personId && u.personId !== survivor.personId).map(u => u.personId as string)
        ));
        if (sourcePersonIds.length === 0) {
            message.info('Выбранные записи уже относятся к одной личности');
            return;
        }
        setMerging(gk);
        try {
            const res = await api.post('/admin/identity/merge-persons', {
                targetPersonId: survivor.personId,
                sourcePersonIds,
            });
            message.success(`Объединено: перецеплено пользователей ${res.data?.repointedUsers ?? 0}. Объединение можно отменить ниже.`);
            setSel(prev => { const n = { ...prev }; delete n[gk]; return n; });
            setSurv(prev => { const n = { ...prev }; delete n[gk]; return n; });
            loadReport();
            loadHistory();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка слияния');
        } finally {
            setMerging(null);
        }
    };

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

            {/* Сверка — готовность к переключению */}
            <Card
                style={{ marginBottom: 16 }}
                title={<span>Сверка: новый фундамент == старые данные</span>}
                extra={<Button icon={<ReloadOutlined />} onClick={loadRecon} loading={reconLoading}>Пересчитать</Button>}
            >
                {!recon ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>{reconLoading ? <Spin /> : <Text type="secondary">Нажмите «Пересчитать»</Text>}</div>
                ) : (
                    <>
                        <Alert
                            style={{ marginBottom: 16 }}
                            type={recon.ok ? 'success' : 'warning'}
                            showIcon
                            message={recon.ok ? 'Полное совпадение — можно переключаться' : 'Есть расхождения — переключаться пока рано'}
                            description={recon.ok
                                ? 'Новый слой (Личности, Членство, Транспорт) полностью соответствует старым данным.'
                                : 'Ниже показано, где новое расходится со старым. Обычно достаточно догнать бэкфиллами (Шаги 1, 4, 5) и пересчитать.'}
                        />
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                <Card size="small" title="Личности">
                                    <Statistic title="Активных пользователей" value={recon.persons.activeUsers} />
                                    <div style={{ marginTop: 8 }}>
                                        С личностью: <b>{recon.persons.withPerson}</b> · без личности:{' '}
                                        <b style={{ color: recon.persons.withoutPerson ? '#dc2626' : undefined }}>{recon.persons.withoutPerson}</b>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card size="small" title="Членство">
                                    <div>Ожидается: <b>{recon.affiliations.expected}</b> · в новом: <b>{recon.affiliations.inNew}</b></div>
                                    <div style={{ marginTop: 8 }}>
                                        Нет в новом: <b style={{ color: recon.affiliations.missingInNew ? '#dc2626' : undefined }}>{recon.affiliations.missingInNew}</b>{' '}
                                        · лишних: <b style={{ color: recon.affiliations.extraInNew ? '#dc2626' : undefined }}>{recon.affiliations.extraInNew}</b>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} md={8}>
                                <Card size="small" title="Транспорт">
                                    <div>Ожидается связей: <b>{recon.vehicles.expectedLinks}</b> · связано: <b>{recon.vehicles.linkedOk}</b></div>
                                    <div style={{ marginTop: 8 }}>
                                        Не хватает: <b style={{ color: recon.vehicles.missingLinks ? '#dc2626' : undefined }}>{recon.vehicles.missingLinks}</b>{' '}
                                        · расхождений: <b style={{ color: recon.vehicles.mismatched ? '#dc2626' : undefined }}>{recon.vehicles.mismatched}</b>
                                    </div>
                                </Card>
                            </Col>
                        </Row>

                        {!recon.ok && (
                            <div style={{ marginTop: 16 }}>
                                {recon.persons.withoutPersonSample.length > 0 && (
                                    <Alert style={{ marginBottom: 8 }} type="warning" message={`Без личности: ${recon.persons.withoutPersonSample.map(u => u.fullName).join(', ')}`} />
                                )}
                                {recon.affiliations.missingSample.length > 0 && (
                                    <Alert style={{ marginBottom: 8 }} type="warning" message={`Членство не создано: ${recon.affiliations.missingSample.map(m => `${m.person} → ${m.company} (${ROLE_LABELS[m.role] || m.role})`).join('; ')}`} />
                                )}
                                {recon.affiliations.extraSample.length > 0 && (
                                    <Alert style={{ marginBottom: 8 }} type="warning" message={`Лишнее членство: ${recon.affiliations.extraSample.map(m => `${m.person} → ${m.company} (${ROLE_LABELS[m.role] || m.role})`).join('; ')}`} />
                                )}
                                {recon.vehicles.missingSample.length > 0 && (
                                    <Alert style={{ marginBottom: 8 }} type="warning" message={`Транспорт без связи: ${recon.vehicles.missingSample.join(', ')}`} />
                                )}
                                {recon.vehicles.mismatchSample.length > 0 && (
                                    <Alert style={{ marginBottom: 8 }} type="error" message={`Транспорт — расхождение водителя: ${recon.vehicles.mismatchSample.join(', ')}`} />
                                )}
                            </div>
                        )}
                    </>
                )}
            </Card>

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
                                {report.groups.map((g, i) => {
                                    const gk = `${g.reason}:${g.key}`;
                                    const selectedUserIds = sel[gk] || [];
                                    const selectedWithPerson = g.users.filter(u => selectedUserIds.includes(u.userId) && u.personId);
                                    const hasNoPerson = g.users.some(u => !u.personId);
                                    return (
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
                                                rowSelection={{
                                                    selectedRowKeys: selectedUserIds,
                                                    onChange: (keys) => setSel(prev => ({ ...prev, [gk]: keys as string[] })),
                                                    getCheckboxProps: (record: DupUser) => ({ disabled: !record.personId }),
                                                }}
                                                columns={[
                                                    { title: 'ФИО', dataIndex: 'fullName', key: 'fullName' },
                                                    { title: 'Роль', dataIndex: 'role', key: 'role', render: (r: string) => <Tag>{ROLE_LABELS[r] || r}</Tag> },
                                                    { title: 'Компания', dataIndex: 'companyName', key: 'companyName', render: (c: string) => c || <Text type="secondary">—</Text> },
                                                    { title: 'Телефон', dataIndex: 'phone', key: 'phone', render: (p: string) => p || '—' },
                                                    { title: 'ИИН', dataIndex: 'iin', key: 'iin', render: (v: string) => v || '—' },
                                                    { title: 'Личность', dataIndex: 'personId', key: 'personId', render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(-6)}</Text> : <Tag color="orange">нет</Tag> },
                                                ]}
                                            />

                                            {hasNoPerson && (
                                                <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                                                    У части записей нет «Личности» — сначала запустите бэкфилл (Шаг 1).
                                                </Text>
                                            )}

                                            {selectedWithPerson.length >= 2 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--lc-border, #f0f0f0)' }}>
                                                    <Text style={{ fontSize: 13 }}>Основная запись:</Text>
                                                    <Select
                                                        size="small"
                                                        style={{ minWidth: 240 }}
                                                        value={surv[gk] && selectedWithPerson.some(u => u.userId === surv[gk]) ? surv[gk] : selectedWithPerson[0].userId}
                                                        onChange={(v) => setSurv(prev => ({ ...prev, [gk]: v }))}
                                                        options={selectedWithPerson.map(u => ({ value: u.userId, label: `${u.fullName} (${u.companyName || 'без компании'})` }))}
                                                    />
                                                    <Popconfirm
                                                        title="Объединить выбранные записи в одну личность?"
                                                        description="Затрагивается только связь с личностью. Заявки, компании и данные не меняются."
                                                        okText="Да, объединить"
                                                        cancelText="Отмена"
                                                        onConfirm={() => mergeGroup(g, gk)}
                                                    >
                                                        <Button type="primary" size="small" icon={<MergeCellsOutlined />} loading={merging === gk}>
                                                            Объединить выбранные ({selectedWithPerson.length})
                                                        </Button>
                                                    </Popconfirm>
                                                </div>
                                            )}
                                        </Card>
                                    );
                                })}
                            </Space>
                        )}
                    </>
                ) : (
                    <Alert type="warning" showIcon message="Отчёт недоступен" />
                )}
            </Card>

            <Card title={<span>Шаг 3. История объединений (можно отменить)</span>} style={{ marginTop: 16 }}>
                <Alert
                    type="success"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Любое объединение полностью обратимо"
                    description="Кнопка «Разъединить» вернёт пользователей на прежние личности. Ничего, кроме связи с личностью, при этом не менялось и не восстанавливается — все данные на месте."
                />
                {history.length === 0 ? (
                    <Alert type="info" showIcon message="Активных объединений пока нет" />
                ) : (
                    <Table
                        size="small"
                        pagination={false}
                        rowKey="mergeId"
                        dataSource={history}
                        columns={[
                            { title: 'Когда', dataIndex: 'createdAt', key: 'createdAt', render: (d: string) => new Date(d).toLocaleString('ru-RU') },
                            { title: 'Основная личность', dataIndex: 'targetName', key: 'targetName' },
                            {
                                title: 'Присоединено',
                                key: 'users',
                                render: (_: any, r: MergeRow) => (
                                    <span>{r.users.map(u => `${u.fullName}${u.companyName ? ` (${u.companyName})` : ''}`).join(', ') || `${r.mergedCount}`}</span>
                                ),
                            },
                            {
                                title: '',
                                key: 'action',
                                width: 130,
                                render: (_: any, r: MergeRow) => (
                                    <Popconfirm
                                        title="Разъединить это объединение?"
                                        description="Пользователи вернутся на свои прежние личности."
                                        okText="Да, разъединить"
                                        cancelText="Отмена"
                                        onConfirm={() => revertMerge(r.mergeId)}
                                    >
                                        <Button danger size="small" loading={reverting === r.mergeId}>Разъединить</Button>
                                    </Popconfirm>
                                ),
                            },
                        ]}
                    />
                )}
            </Card>

            <Card
                title={<span>Шаг 4. Членство в компаниях (Affiliation)</span>}
                style={{ marginTop: 16 }}
                extra={<Button icon={<ReloadOutlined />} onClick={loadAff}>Обновить</Button>}
            >
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Фаза 2 — фундамент «один человек в нескольких компаниях»"
                    description="Заполняет новую таблицу членства из текущих данных (домашняя компания + мультикомпания), НИЧЕГО не меняя в существующей логике. Ниже видно людей, которые работают сразу в нескольких компаниях как одна личность — без дублей."
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <div>
                        <Text strong>Заполнить членство</Text>
                        <div style={{ color: '#8a91a0', fontSize: 13 }}>
                            Безопасно и идемпотентно. Требует, чтобы сначала были созданы личности (Шаг 1).
                        </div>
                    </div>
                    <Button type="primary" loading={backfillingAff} onClick={runBackfillAff}>
                        Запустить бэкфилл членства
                    </Button>
                </div>

                {aff && (
                    <>
                        <Row gutter={16} style={{ marginBottom: 16 }}>
                            <Col><Statistic title="Всего связей" value={aff.totalAffiliations} /></Col>
                            <Col><Statistic title="Личностей" value={aff.totalPersons} /></Col>
                            <Col><Statistic title="В нескольких компаниях" value={aff.multiCompanyCount} /></Col>
                        </Row>

                        {aff.multiCompanyPersons.length === 0 ? (
                            <Alert type="info" showIcon message="Пока нет людей, работающих в нескольких компаниях" />
                        ) : (
                            <Table
                                size="small"
                                pagination={{ pageSize: 10 }}
                                rowKey="personId"
                                dataSource={aff.multiCompanyPersons}
                                columns={[
                                    { title: 'Человек', dataIndex: 'fullName', key: 'fullName' },
                                    { title: 'Компаний', dataIndex: 'companyCount', key: 'companyCount', width: 100 },
                                    {
                                        title: 'Где работает',
                                        key: 'companies',
                                        render: (_: any, r: AffOverview['multiCompanyPersons'][number]) => (
                                            <Space size={[6, 6]} wrap>
                                                {r.companies.map((c, idx) => (
                                                    <Tag key={idx}>{c.name}{c.roles.length ? ` · ${c.roles.map(x => ROLE_LABELS[x] || x).join(', ')}` : ''}</Tag>
                                                ))}
                                            </Space>
                                        ),
                                    },
                                ]}
                            />
                        )}
                    </>
                )}
            </Card>

            <Card
                title={<span>Шаг 5. Транспорт как актив (Фаза 3)</span>}
                style={{ marginTop: 16 }}
                extra={<Button icon={<ReloadOutlined />} onClick={loadVeh}>Обновить</Button>}
            >
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Связь машина ↔ водитель настоящей ссылкой"
                    description="Раньше транспорт «переезжал» копированием госномера в карточку водителя. Здесь машина получает реальную ссылку на водителя (по совпадению госномера), НИЧЕГО не меняя в существующих полях. Задел под владельца-физлицо и историю рейсов."
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <div>
                        <Text strong>Связать машины с водителями</Text>
                        <div style={{ color: '#8a91a0', fontSize: 13 }}>
                            Безопасно и идемпотентно. Требует, чтобы сначала были созданы личности (Шаг 1).
                        </div>
                    </div>
                    <Button type="primary" loading={backfillingVeh} onClick={runBackfillVeh}>
                        Запустить бэкфилл транспорта
                    </Button>
                </div>

                {veh && (
                    <>
                        <Row gutter={16} style={{ marginBottom: 16 }}>
                            <Col><Statistic title="Всего машин" value={veh.total} /></Col>
                            <Col><Statistic title="С привязанным водителем" value={veh.linkedToDriver} /></Col>
                        </Row>
                        {veh.sample.length === 0 ? (
                            <Alert type="info" showIcon message="Пока нет машин, связанных с водителем ссылкой" />
                        ) : (
                            <Table
                                size="small"
                                pagination={{ pageSize: 10 }}
                                rowKey={(r: VehOverview['sample'][number]) => `${r.company}-${r.plate}`}
                                dataSource={veh.sample}
                                columns={[
                                    { title: 'Госномер', dataIndex: 'plate', key: 'plate' },
                                    { title: 'Модель', dataIndex: 'model', key: 'model' },
                                    { title: 'Компания', dataIndex: 'company', key: 'company' },
                                    { title: 'Водитель', dataIndex: 'driver', key: 'driver', render: (d: string) => d || <Text type="secondary">—</Text> },
                                ]}
                            />
                        )}
                    </>
                )}
            </Card>
        </div>
    );
}
