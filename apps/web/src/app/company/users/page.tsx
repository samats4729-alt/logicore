'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Modal, Form, Input, Select, message, Typography, Space, Popconfirm, Tabs, Alert, Checkbox, Radio, Divider, Empty, Row, Col } from 'antd';
import { MailOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SettingOutlined, ApartmentOutlined, FolderOpenOutlined, PlusOutlined, UnorderedListOutlined, UserOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const MODULE_PERMISSIONS = [
    { label: 'Заявки', value: 'orders' },
    { label: 'Документы', value: 'documents' },
    { label: 'Бухгалтерия', value: 'accounting' },
    { label: 'Контрагенты', value: 'partners' },
    { label: 'Карта / Трекинг', value: 'tracking' },
    { label: 'Водители', value: 'drivers' },
];

const { Title, Text } = Typography;

interface CompanyUser {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    role: string;
    permissions: string[];
    createdAt: string;
    departmentId?: string | null;
    department?: { id: string; name: string } | null;
}

interface Invitation {
    id: string;
    email: string;
    role: string;
    token: string;
    permissions: string[];
    createdAt: string;
}

const roleLabels: Record<string, string> = {
    COMPANY_ADMIN: 'Администратор',
    LOGISTICIAN: 'Менеджер',
    ACCOUNTANT: 'Бухгалтер',
    WAREHOUSE_MANAGER: 'Завсклад',
    FORWARDER: 'Экспедитор',
    DRIVER: 'Водитель',
};

const roleColors: Record<string, string> = {
    COMPANY_ADMIN: 'red',
    LOGISTICIAN: 'blue',
    ACCOUNTANT: 'gold',
    WAREHOUSE_MANAGER: 'green',
    FORWARDER: 'orange',
    DRIVER: 'purple',
};

export default function CompanyUsersPage() {
    const { user: currentUser } = useAuthStore();
    const [users, setUsers] = useState<CompanyUser[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [companyName, setCompanyName] = useState<string>('Наша Компания');
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
    
    // Original modals state
    const [modalOpen, setModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();

    // Department modals state
    const [deptModalOpen, setDeptModalOpen] = useState(false);
    const [deptForm] = Form.useForm();
    const [selectedParentDeptId, setSelectedParentDeptId] = useState<string | null>(null);
    
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renamingDept, setRenamingDept] = useState<any>(null);
    const [renameForm] = Form.useForm();
    
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assignForm] = Form.useForm();
    const [assignDeptId, setAssignDeptId] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, invRes, deptsRes, profileRes] = await Promise.all([
                api.get('/company/users'),
                api.get('/company/invitations'),
                api.get('/company/departments').catch(() => ({ data: [] })),
                api.get('/company/profile').catch(() => ({ data: null })),
            ]);
            setUsers(Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data.data || []));
            setInvitations(invRes.data || []);
            setDepartments(deptsRes.data || []);
            if (profileRes.data && profileRes.data.name) {
                setCompanyName(profileRes.data.name);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ==================== Department CRUD handlers ====================

    const handleCreateDept = async (values: any) => {
        try {
            await api.post('/company/departments', {
                name: values.name,
                parentDepartmentId: selectedParentDeptId || undefined,
            });
            message.success('Отдел успешно создан');
            setDeptModalOpen(false);
            deptForm.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания отдела');
        }
    };

    const handleRenameDept = async (values: any) => {
        try {
            if (!renamingDept) return;
            await api.put(`/company/departments/${renamingDept.id}`, {
                name: values.name,
            });
            message.success('Название отдела обновлено');
            setRenameModalOpen(false);
            renameForm.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка переименования отдела');
        }
    };

    const handleDeleteDept = async (id: string) => {
        try {
            await api.delete(`/company/departments/${id}`);
            message.success('Отдел удален. Сотрудники переведены в нераспределенные.');
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка удаления отдела');
        }
    };

    const handleAssignUser = async (values: any) => {
        try {
            await api.put('/company/departments/users/assign', {
                userId: values.userId,
                departmentId: assignDeptId,
            });
            message.success('Сотрудник назначен в отдел');
            setAssignModalOpen(false);
            assignForm.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка назначения сотрудника');
        }
    };

    const handleUnassignUser = async (userId: string) => {
        try {
            await api.put('/company/departments/users/assign', {
                userId,
                departmentId: null,
            });
            message.success('Сотрудник убран из отдела');
            fetchData();
        } catch (error: any) {
            message.error('Ошибка');
        }
    };

    const handleAddSubDeptClick = (parentId: string | null) => {
        setSelectedParentDeptId(parentId);
        deptForm.resetFields();
        setDeptModalOpen(true);
    };

    const handleRenameDeptClick = (dept: any) => {
        setRenamingDept(dept);
        renameForm.setFieldsValue({ name: dept.name });
        setRenameModalOpen(true);
    };

    const handleAssignUserClick = (deptId: string) => {
        setAssignDeptId(deptId);
        assignForm.resetFields();
        setAssignModalOpen(true);
    };

    // ==================== Original employee handlers ====================

    const handleInvite = async (values: any) => {
        try {
            const res = await api.post('/company/invitations', values);
            message.success('Приглашение создано');
            const link = `${window.location.origin}/invite?token=${res.data.token}`;
            setGeneratedLink(link);
            form.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const handleCancelInvitation = async (id: string) => {
        try {
            await api.delete(`/company/invitations/${id}`);
            message.success('Приглашение отменено');
            fetchData();
        } catch (error) {
            message.error('Ошибка');
        }
    };

    const handleEditPermissions = async (values: any) => {
        try {
            if (!editingUser) return;
            await api.put(`/company/users/${editingUser.id}/permissions`, {
                permissions: values.permissions || [],
            });
            message.success('Права доступа обновлены');
            setEditModalOpen(false);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        try {
            await api.delete(`/company/users/${userId}`);
            message.success('Пользователь удалён');
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const openInviteModal = () => {
        setGeneratedLink(null);
        form.resetFields();
        setModalOpen(true);
    };

    const copyToClipboard = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink);
            message.success('Ссылка скопирована в буфер обмена');
        }
    };

    // ==================== Hierarchy tree builder ====================

    const getSubDepartments = (parentId: string | null) => {
        return departments.filter(d => d.parentDepartmentId === parentId);
    };

    const renderDeptNode = (dept: any) => {
        const subDepts = getSubDepartments(dept.id);
        const deptUsers = dept.users || [];

        return (
            <div className="org-tree-child-wrapper" key={dept.id}>
                {/* Connector line from sibling bar down */}
                <div className="org-tree-child-wrapper-card-line"></div>

                {/* Card representation of the node */}
                <Card
                    size="small"
                    className="dept-node-card"
                    title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>
                                <FolderOpenOutlined style={{ marginRight: 6, color: '#3b82f6' }} />
                                {dept.name}
                            </span>
                            <Space size={2}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<PlusOutlined style={{ fontSize: 10, color: '#4b5563' }} />}
                                    title="Добавить подотдел"
                                    onClick={() => handleAddSubDeptClick(dept.id)}
                                />
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined style={{ fontSize: 10, color: '#4b5563' }} />}
                                    title="Переименовать"
                                    onClick={() => handleRenameDeptClick(dept)}
                                />
                                <Popconfirm
                                    title="Удалить отдел? Сотрудники перейдут в нераспределенные."
                                    onConfirm={() => handleDeleteDept(dept.id)}
                                    okText="Да"
                                    cancelText="Нет"
                                >
                                    <Button
                                        type="text"
                                        danger
                                        size="small"
                                        icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                                        title="Удалить"
                                    />
                                </Popconfirm>
                            </Space>
                        </div>
                    }
                    style={{ 
                        width: 280, 
                        borderRadius: 12, 
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                        border: '1px solid #e5e7eb'
                    }}
                >
                    <div style={{ minHeight: 40, maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                        {deptUsers.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '12px 0' }}>
                                Нет сотрудников
                            </div>
                        ) : (
                            deptUsers.map((u: any) => (
                                <div
                                    key={u.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '6px 8px',
                                        marginBottom: 4,
                                        background: '#f9fafb',
                                        borderRadius: 8,
                                        border: '1px solid #f3f4f6'
                                    }}
                                >
                                    <Space size={6}>
                                        <div
                                            style={{
                                                width: 20,
                                                height: 20,
                                                borderRadius: '50%',
                                                background: roleColors[u.role] || '#9ca3af',
                                                color: '#fff',
                                                fontSize: 9,
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            {u.firstName[0]}
                                        </div>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.lastName} {u.firstName[0]}.
                                        </div>
                                    </Space>
                                    <Space size={2}>
                                        <Tag color={roleColors[u.role]} style={{ fontSize: 8, margin: 0, padding: '0 4px', lineHeight: '14px', borderRadius: 4 }}>
                                            {roleLabels[u.role] || u.role}
                                        </Tag>
                                        <Button
                                            type="text"
                                            danger
                                            size="small"
                                            style={{ padding: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            icon={<span style={{ fontSize: 12, lineHeight: 1 }}>×</span>}
                                            title="Убрать из отдела"
                                            onClick={() => handleUnassignUser(u.id)}
                                        />
                                    </Space>
                                </div>
                            ))
                        )}
                    </div>
                    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, marginTop: 8 }}>
                        <Button
                            type="dashed"
                            size="small"
                            icon={<PlusOutlined />}
                            style={{ width: '100%', fontSize: 11, borderRadius: 6, color: '#4b5563' }}
                            onClick={() => handleAssignUserClick(dept.id)}
                        >
                            Назначить сотрудника
                        </Button>
                    </div>
                </Card>

                {/* Subdepartments rendered recursively */}
                {subDepts.length > 0 && (
                    <div className="org-tree-children-container">
                        {subDepts.map(sd => renderDeptNode(sd))}
                    </div>
                )}
            </div>
        );
    };

    const renderRootNode = () => {
        const rootDepts = getSubDepartments(null);
        // Company admins
        const adminUsers = users.filter(u => u.role === 'COMPANY_ADMIN');

        return (
            <div className="org-tree">
                <Card
                    size="small"
                    className="company-root-card"
                    title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                                <ApartmentOutlined style={{ marginRight: 8, color: '#ef4444' }} />
                                {companyName}
                            </span>
                            <Button
                                type="primary"
                                size="small"
                                icon={<PlusOutlined />}
                                style={{ borderRadius: 6, fontSize: 12, height: 24 }}
                                onClick={() => handleAddSubDeptClick(null)}
                            >
                                Отдел
                            </Button>
                        </div>
                    }
                    style={{ 
                        width: 320, 
                        borderRadius: 12, 
                        border: '2px solid #fecaca', 
                        boxShadow: '0 10px 25px rgba(239, 68, 68, 0.05)' 
                    }}
                >
                    <div style={{ padding: '4px 0' }}>
                        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 6, fontWeight: 700, letterSpacing: '0.05em' }}>
                            АДМИНИСТРАЦИЯ
                        </div>
                        {adminUsers.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '10px 0' }}>
                                Нет назначенных админов
                            </div>
                        ) : (
                            adminUsers.map(u => (
                                <div
                                    key={u.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '6px 10px',
                                        marginBottom: 4,
                                        background: '#fef2f2',
                                        borderRadius: 8,
                                        border: '1px solid #fee2e2'
                                    }}
                                >
                                    <Space size={8}>
                                        <div
                                            style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: '50%',
                                                background: '#ef4444',
                                                color: '#fff',
                                                fontSize: 10,
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            {u.firstName[0]}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b' }}>{u.lastName} {u.firstName}</div>
                                            <div style={{ fontSize: 10, color: '#7f1d1d', opacity: 0.7 }}>{u.phone || u.email}</div>
                                        </div>
                                    </Space>
                                    <Tag color="red" style={{ fontSize: 8, margin: 0, borderRadius: 4 }}>Админ</Tag>
                                </div>
                            ))
                        )}
                    </div>
                </Card>

                {rootDepts.length > 0 && (
                    <div className="org-tree-children-container">
                        {rootDepts.map(sd => renderDeptNode(sd))}
                    </div>
                )}
            </div>
        );
    };

    // ==================== Active Tables config ====================

    const userColumns = [
        {
            title: 'Имя',
            key: 'name',
            render: (_: any, record: CompanyUser) => `${record.firstName} ${record.lastName}`,
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
        },
        {
            title: 'Роль',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <Tag color={roleColors[role] || 'default'}>
                    {roleLabels[role] || role}
                </Tag>
            ),
        },
        {
            title: 'Отдел',
            dataIndex: 'department',
            key: 'department',
            render: (dept: any) => dept ? (
                <Tag color="cyan">
                    <FolderOpenOutlined style={{ marginRight: 4 }} />
                    {dept.name}
                </Tag>
            ) : (
                <Text type="secondary">—</Text>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: CompanyUser) => (
                <Space>
                    {record.id !== currentUser?.id && (
                        <Button
                            icon={<SettingOutlined />}
                            onClick={() => {
                                setEditingUser(record);
                                editForm.setFieldsValue({ permissions: record.permissions || [] });
                                setEditModalOpen(true);
                            }}
                        />
                    )}
                    {record.id !== currentUser?.id && (
                        <Popconfirm
                            title="Удалить пользователя?"
                            onConfirm={() => handleDeleteUser(record.id)}
                            okText="Да"
                            cancelText="Нет"
                        >
                            <Button icon={<DeleteOutlined />} danger />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    const invitationColumns = [
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Роль',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <Tag color={roleColors[role] || 'default'}>
                    {roleLabels[role] || role}
                </Tag>
            ),
        },
        {
            title: 'Создано',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => new Date(date).toLocaleString('ru-RU'),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Invitation) => (
                <Popconfirm
                    title="Отменить приглашение?"
                    onConfirm={() => handleCancelInvitation(record.id)}
                    okText="Да"
                    cancelText="Нет"
                >
                    <Button danger>Отменить</Button>
                </Popconfirm>
            ),
        },
    ];

    // Unassigned users list
    const unassignedUsers = users.filter(
        u => !u.departmentId && u.role !== 'COMPANY_ADMIN' && u.role !== 'ADMIN'
    );

    return (
        <div className="company-structure-page">
            {/* Inline CSS styling for the family tree lines */}
            <style>{`
                .org-tree-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                    overflow-x: auto;
                    padding: 40px 10px;
                    background: #fdfdfd;
                    border-radius: 12px;
                    border: 1px dashed #e5e7eb;
                    min-height: 480px;
                }
                
                .org-tree {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                
                .org-tree-children-container {
                    display: flex;
                    padding-top: 24px;
                    position: relative;
                }
                
                .org-tree-children-container::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 50%;
                    width: 2px;
                    height: 24px;
                    background-color: #d1d5db;
                }
                
                .org-tree-child-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 0 16px;
                    position: relative;
                }
                
                .org-tree-child-wrapper::before,
                .org-tree-child-wrapper::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    width: 50%;
                    height: 2px;
                    background-color: #d1d5db;
                }
                
                .org-tree-child-wrapper::before {
                    right: 50%;
                }
                
                .org-tree-child-wrapper::after {
                    left: 50%;
                }
                
                .org-tree-child-wrapper:first-child::before {
                    display: none;
                }
                
                .org-tree-child-wrapper:last-child::after {
                    display: none;
                }
                
                .org-tree-child-wrapper-card-line {
                    width: 2px;
                    height: 24px;
                    background-color: #d1d5db;
                }
                
                .dept-node-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .dept-node-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 30px rgba(59, 130, 246, 0.08) !important;
                    border-color: #93c5fd !important;
                }

                .company-root-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .company-root-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 30px rgba(239, 68, 68, 0.08) !important;
                    border-color: #fca5a5 !important;
                }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>Сотрудники</Title>
                    <Text type="secondary">Управление отделами, структурой и правами сотрудников</Text>
                </div>
                <Space>
                    <Radio.Group value={viewMode} onChange={e => setViewMode(e.target.value)} buttonStyle="solid">
                        <Radio.Button value="tree">
                            <ApartmentOutlined style={{ marginRight: 6 }} />
                            Схема
                        </Radio.Button>
                        <Radio.Button value="list">
                            <UnorderedListOutlined style={{ marginRight: 6 }} />
                            Список
                        </Radio.Button>
                    </Radio.Group>
                    <Button type="primary" icon={<MailOutlined />} onClick={openInviteModal}>
                        Пригласить
                    </Button>
                </Space>
            </div>

            {viewMode === 'tree' ? (
                <Row gutter={20}>
                    <Col xs={24} lg={18}>
                        <div className="org-tree-container">
                            {departments.length === 0 && getSubDepartments(null).length === 0 ? (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="Структура отделов еще не создана"
                                >
                                    <Button 
                                        type="primary" 
                                        icon={<PlusOutlined />} 
                                        onClick={() => handleAddSubDeptClick(null)}
                                    >
                                        Создать первый отдел
                                    </Button>
                                </Empty>
                            ) : (
                                renderRootNode()
                            )}
                        </div>
                    </Col>
                    <Col xs={24} lg={6}>
                        <Card 
                            title={
                                <span style={{ fontWeight: 600, color: '#374151' }}>
                                    <UserOutlined style={{ marginRight: 6, color: '#6b7280' }} />
                                    Нераспределенные ({unassignedUsers.length})
                                </span>
                            }
                            size="small"
                            style={{ borderRadius: 12, minHeight: 480, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
                            bodyStyle={{ padding: 12 }}
                        >
                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>
                                Сотрудники и водители без привязки к отделам. Вы можете назначить их из карточки нужного отдела.
                            </Text>
                            
                            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                                {unassignedUsers.length === 0 ? (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Все распределены" style={{ marginTop: 40 }} />
                                ) : (
                                    unassignedUsers.map(u => (
                                        <div
                                            key={u.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 10px',
                                                background: '#f9fafb',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: 8,
                                                marginBottom: 6
                                            }}
                                        >
                                            <Space size={8}>
                                                <div
                                                    style={{
                                                        width: 24,
                                                        height: 24,
                                                        borderRadius: '50%',
                                                        background: roleColors[u.role] || '#6b7280',
                                                        color: '#fff',
                                                        fontSize: 10,
                                                        fontWeight: 'bold',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    {u.firstName[0]}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>
                                                        {u.lastName} {u.firstName}
                                                    </div>
                                                    <Tag color={roleColors[u.role]} style={{ fontSize: 8, margin: 0, padding: '0 4px', lineHeight: '14px', borderRadius: 4 }}>
                                                        {roleLabels[u.role] || u.role}
                                                    </Tag>
                                                </div>
                                            </Space>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>
                    </Col>
                </Row>
            ) : (
                <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                    <Tabs defaultActiveKey="1">
                        <Tabs.TabPane tab={`Активные (${users.length})`} key="1">
                            <Table
                                columns={userColumns}
                                dataSource={users}
                                rowKey="id"
                                loading={loading}
                                pagination={{ pageSize: 10 }}
                            />
                        </Tabs.TabPane>
                        <Tabs.TabPane tab={`Приглашения (${invitations.length})`} key="2">
                            <Table
                                columns={invitationColumns}
                                dataSource={invitations}
                                rowKey="id"
                                loading={loading}
                                pagination={{ pageSize: 10 }}
                            />
                        </Tabs.TabPane>
                    </Tabs>
                </Card>
            )}

            {/* Modal: Create Department */}
            <Modal
                title={selectedParentDeptId ? 'Создание подотдела' : 'Создание отдела'}
                open={deptModalOpen}
                onCancel={() => setDeptModalOpen(false)}
                onOk={() => deptForm.submit()}
                okText="Создать"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={deptForm} layout="vertical" onFinish={handleCreateDept}>
                    <Form.Item
                        name="name"
                        label="Название отдела"
                        rules={[{ required: true, message: 'Введите название отдела' }]}
                    >
                        <Input placeholder="Например: Отдел логистики" maxLength={100} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Rename Department */}
            <Modal
                title="Редактирование отдела"
                open={renameModalOpen}
                onCancel={() => setRenameModalOpen(false)}
                onOk={() => renameForm.submit()}
                okText="Сохранить"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={renameForm} layout="vertical" onFinish={handleRenameDept}>
                    <Form.Item
                        name="name"
                        label="Название отдела"
                        rules={[{ required: true, message: 'Введите название отдела' }]}
                    >
                        <Input placeholder="Например: Бухгалтерия" maxLength={100} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Assign User to Department */}
            <Modal
                title="Назначение сотрудника в отдел"
                open={assignModalOpen}
                onCancel={() => setAssignModalOpen(false)}
                onOk={() => assignForm.submit()}
                okText="Назначить"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={assignForm} layout="vertical" onFinish={handleAssignUser}>
                    <Form.Item
                        name="userId"
                        label="Выберите сотрудника"
                        rules={[{ required: true, message: 'Выберите сотрудника' }]}
                    >
                        <Select placeholder="Сотрудники без отдела">
                            {unassignedUsers.map(u => (
                                <Select.Option key={u.id} value={u.id}>
                                    {u.lastName} {u.firstName} ({roleLabels[u.role] || u.role})
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Invite Employee (Original) */}
            <Modal
                title="Приглашение сотрудника"
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={generatedLink ? [
                    <Button key="close" type="primary" onClick={() => setModalOpen(false)}>
                        Готово
                    </Button>
                ] : [
                    <Button key="cancel" onClick={() => setModalOpen(false)}>Отмена</Button>,
                    <Button key="submit" type="primary" onClick={() => form.submit()}>Создать ссылку</Button>
                ]}
            >
                {generatedLink ? (
                    <div style={{ padding: '20px 0', textAlign: 'center' }}>
                        <MailOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                        <Title level={5}>Приглашение успешно создано!</Title>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Скопируйте эту ссылку и отправьте её сотруднику:
                        </Text>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Input value={generatedLink} readOnly />
                            <Button 
                                type="primary" 
                                icon={<CopyOutlined />} 
                                onClick={copyToClipboard}
                                style={{ marginLeft: 8 }}
                            />
                        </div>
                    </div>
                ) : (
                    <Form form={form} layout="vertical" onFinish={handleInvite}>
                        <Form.Item name="email" label="Email сотрудника" rules={[{ required: true, type: 'email' }]}>
                            <Input placeholder="employee@company.kz" />
                        </Form.Item>
                        <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
                            <Select placeholder="Выберите роль">
                                <Select.Option value="LOGISTICIAN">Менеджер</Select.Option>
                                <Select.Option value="ACCOUNTANT">Бухгалтер</Select.Option>
                                <Select.Option value="WAREHOUSE_MANAGER">Завсклад</Select.Option>
                                <Select.Option value="DRIVER">Водитель</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="permissions" label="Права доступа (для левого меню)">
                            <Checkbox.Group options={MODULE_PERMISSIONS} />
                        </Form.Item>
                        <Alert 
                            message="Сотрудник сам введёт свои данные" 
                            description="По этой ссылке сотрудник сможет сам задать себе ФИО, телефон и пароль для входа." 
                            type="info" 
                            showIcon 
                            style={{ marginTop: 16 }}
                        />
                    </Form>
                )}
            </Modal>

            {/* Modal: Edit Permissions (Original) */}
            <Modal
                title={`Права доступа: ${editingUser?.firstName} ${editingUser?.lastName}`}
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                onOk={() => editForm.submit()}
                okText="Сохранить"
                cancelText="Отмена"
            >
                <Form form={editForm} layout="vertical" onFinish={handleEditPermissions}>
                    <Form.Item name="permissions" label="Доступ к разделам">
                        <Checkbox.Group options={MODULE_PERMISSIONS} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
