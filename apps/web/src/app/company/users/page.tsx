'use client';

import { useEffect, useState, useRef } from 'react';
import { Table, Card, Button, Tag, Modal, Form, Input, Select, message, Typography, Space, Popconfirm, Tabs, Alert, Checkbox, Radio, Divider, Empty, Row, Col, DatePicker, Tooltip, Segmented } from 'antd';
import dayjs from 'dayjs';
import { 
    MailOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SettingOutlined, 
    ApartmentOutlined, FolderOpenOutlined, PlusOutlined, UnorderedListOutlined, UserOutlined,
    DollarOutlined, CalculatorOutlined, TruckOutlined, TeamOutlined, CarryOutOutlined,
    NotificationOutlined, ShopOutlined, CoffeeOutlined, UserAddOutlined, DisconnectOutlined,
    CarOutlined, InboxOutlined, PushpinOutlined, FileTextOutlined, EnvironmentOutlined, DashboardOutlined,
    AimOutlined, IdcardOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { VEHICLE_TYPES } from '@/lib/constants';

const ROLE_OPTIONS = [
    { label: 'Менеджер', value: 'LOGISTICIAN' },
    { label: 'Бухгалтер', value: 'ACCOUNTANT' },
    { label: 'Завсклад', value: 'WAREHOUSE_MANAGER' },
    { label: 'Водитель', value: 'DRIVER' },
    { label: 'Экспедитор', value: 'FORWARDER' },
    { label: 'Администратор', value: 'COMPANY_ADMIN' },
];

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
    
    // Driver fields
    iin?: string;
    vehicleType?: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    trailerNumber?: string;
    docType?: string;
    docNumber?: string;
    docIssuedAt?: string;
    docExpiresAt?: string;
    docIssuedBy?: string;
    position?: string | null;
}

interface Invitation {
    id: string;
    email: string;
    role: string;
    token: string;
    permissions: string[];
    createdAt: string;
    position?: string | null;
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

const formatNameInitials = (user: { firstName: string; lastName: string; middleName?: string | null }) => {
    const last = user.lastName || '';
    const firstI = user.firstName ? `${user.firstName[0].toUpperCase()}.` : '';
    const middleI = user.middleName ? `${user.middleName[0].toUpperCase()}.` : '';
    return `${last} ${firstI}${middleI}`.trim();
};

const deptIconComponents: Record<string, any> = {
    FolderOpenOutlined,
    DollarOutlined,
    CalculatorOutlined,
    TruckOutlined,
    TeamOutlined,
    CarryOutOutlined,
    NotificationOutlined,
    ShopOutlined,
    CoffeeOutlined,
    CarOutlined,
    InboxOutlined,
    PushpinOutlined,
    FileTextOutlined,
    EnvironmentOutlined,
    SettingOutlined,
    DashboardOutlined,
};

const deptIconColors: Record<string, string> = {
    FolderOpenOutlined: '#3b82f6',
    DollarOutlined: '#eab308',
    CarOutlined: '#3b82f6',
    TruckOutlined: '#10b981',
    TeamOutlined: '#6366f1',
    InboxOutlined: '#f97316',
    PushpinOutlined: '#ef4444',
    FileTextOutlined: '#6b7280',
    EnvironmentOutlined: '#06b6d4',
    SettingOutlined: '#4b5563',
    DashboardOutlined: '#8b5cf6',
    CalculatorOutlined: '#ec4899',
    CarryOutOutlined: '#0d9488',
    NotificationOutlined: '#ea580c',
    ShopOutlined: '#4f46e5',
    CoffeeOutlined: '#b45309',
};

const renderDeptIcon = (iconName: string, fontSize: number = 14) => {
    const IconComp = deptIconComponents[iconName] || FolderOpenOutlined;
    const color = deptIconColors[iconName] || '#3b82f6';
    return <IconComp style={{ fontSize, color }} />;
};

const iconOptions = [
    { value: 'FolderOpenOutlined', label: 'Папка' },
    { value: 'DollarOutlined', label: 'Бухгалтерия / Финансы' },
    { value: 'CarOutlined', label: 'Водители / Транспорт' },
    { value: 'TruckOutlined', label: 'Логистика / Доставка' },
    { value: 'TeamOutlined', label: 'Сотрудники / Отдел' },
    { value: 'InboxOutlined', label: 'Склад / Хранение' },
    { value: 'PushpinOutlined', label: 'Адреса / Локации' },
    { value: 'FileTextOutlined', label: 'Документы / Договоры' },
    { value: 'EnvironmentOutlined', label: 'Карта / Трекинг' },
    { value: 'SettingOutlined', label: 'Настройки / Admin' },
    { value: 'DashboardOutlined', label: 'Дашборд / Аналитика' },
    { value: 'CalculatorOutlined', label: 'Калькулятор' },
    { value: 'CarryOutOutlined', label: 'Портфель / Менеджмент' },
    { value: 'NotificationOutlined', label: 'Оповещения' },
    { value: 'ShopOutlined', label: 'Офис / Магазин' },
    { value: 'CoffeeOutlined', label: 'Разное (Кофе)' },
];

export default function CompanyUsersPage() {
    const { user: currentUser } = useAuthStore();
    const [users, setUsers] = useState<CompanyUser[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [companyName, setCompanyName] = useState<string>('Наша Компания');
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
    const [activeSegment, setActiveSegment] = useState<'office' | 'drivers'>('office');
    
    const treeContainerRef = useRef<HTMLDivElement>(null);

    const handleCenterView = () => {
        if (treeContainerRef.current) {
            const container = treeContainerRef.current;
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            container.scrollTo({
                left: (scrollWidth - clientWidth) / 2,
                top: 0,
                behavior: 'smooth'
            });
        }
    };
    
    // Unified Modal state
    const [unifiedModalOpen, setUnifiedModalOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<string>('LOGISTICIAN');
    const [editingRecord, setEditingRecord] = useState<CompanyUser | null>(null);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [unifiedForm] = Form.useForm();

    // Original modals state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
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

    // Inline department creation states for invite modal
    const [newDeptName, setNewDeptName] = useState('');
    const [addingDeptLoading, setAddingDeptLoading] = useState(false);

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
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const seg = params.get('segment');
            if (seg === 'drivers') {
                setActiveSegment('drivers');
                setViewMode('list');
            } else if (seg === 'office') {
                setActiveSegment('office');
            }
        }
    }, []);

    // Figma/Miro style drag-to-scroll panning
    useEffect(() => {
        if (viewMode !== 'tree') return;

        const container = treeContainerRef.current;
        if (!container) return;

        let isDown = false;
        let startX: number;
        let startY: number;
        let scrollLeft: number;
        let scrollTop: number;

        const handleMouseDown = (e: MouseEvent) => {
            // Only drag with left mouse button
            if (e.button !== 0) return;
            
            // Do not drag if clicking on interactive elements
            const target = e.target as HTMLElement;
            if (
                target.closest('button') || 
                target.closest('a') || 
                target.closest('.ant-select') || 
                target.closest('.node-actions-toolbar') || 
                target.closest('input')
            ) {
                return;
            }

            isDown = true;
            container.style.cursor = 'grabbing';
            startX = e.pageX - container.offsetLeft;
            startY = e.pageY - container.offsetTop;
            scrollLeft = container.scrollLeft;
            scrollTop = container.scrollTop;
        };

        const handleMouseLeave = () => {
            isDown = false;
            container.style.cursor = 'grab';
        };

        const handleMouseUp = () => {
            isDown = false;
            container.style.cursor = 'grab';
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - container.offsetLeft;
            const y = e.pageY - container.offsetTop;
            // Scroll speed multiplier
            const walkX = (x - startX) * 1.5;
            const walkY = (y - startY) * 1.5;
            container.scrollLeft = scrollLeft - walkX;
            container.scrollTop = scrollTop - walkY;
        };

        container.style.cursor = 'grab';
        container.addEventListener('mousedown', handleMouseDown);
        container.addEventListener('mouseleave', handleMouseLeave);
        container.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('mousemove', handleMouseMove);

        return () => {
            container.removeEventListener('mousedown', handleMouseDown);
            container.removeEventListener('mouseleave', handleMouseLeave);
            container.removeEventListener('mouseup', handleMouseUp);
            container.removeEventListener('mousemove', handleMouseMove);
        };
    }, [viewMode]);

    // ==================== Department CRUD handlers ====================

    const handleCreateDept = async (values: any) => {
        try {
            await api.post('/company/departments', {
                name: values.name,
                parentDepartmentId: selectedParentDeptId || undefined,
                icon: values.icon || 'FolderOpenOutlined',
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
                icon: values.icon || 'FolderOpenOutlined',
            });
            message.success('Отдел обновлен');
            setRenameModalOpen(false);
            renameForm.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления отдела');
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
        deptForm.setFieldsValue({ icon: 'FolderOpenOutlined' });
        setDeptModalOpen(true);
    };

    const handleRenameDeptClick = (dept: any) => {
        setRenamingDept(dept);
        renameForm.setFieldsValue({ name: dept.name, icon: dept.icon || 'FolderOpenOutlined' });
        setRenameModalOpen(true);
    };

    const handleAssignUserClick = (deptId: string) => {
        setAssignDeptId(deptId);
        assignForm.resetFields();
        setAssignModalOpen(true);
    };

    const handleInlineCreateDept = async () => {
        if (!newDeptName.trim()) {
            message.warning('Введите название отдела');
            return;
        }
        setAddingDeptLoading(true);
        try {
            const res = await api.post('/company/departments', {
                name: newDeptName.trim(),
                icon: 'FolderOpenOutlined',
            });
            message.success('Отдел успешно создан');
            setNewDeptName('');
            await fetchData();
            unifiedForm.setFieldsValue({ departmentId: res.data.id });
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания отдела');
        } finally {
            setAddingDeptLoading(false);
        }
    };

    // ==================== Unified Employee/Driver handlers ====================

    const handleUnifiedSubmit = async (values: any) => {
        if (selectedRole === 'DRIVER') {
            try {
                const payload = {
                    ...values,
                    docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
                    docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
                };

                if (editingRecord) {
                    await api.put(`/company/drivers/${editingRecord.id}`, payload);
                    message.success('Данные водителя обновлены');
                } else {
                    await api.post('/company/drivers', payload);
                    message.success('Водитель добавлен');
                }
                setUnifiedModalOpen(false);
                setEditingRecord(null);
                unifiedForm.resetFields();
                fetchData();
            } catch (error: any) {
                message.error(error.response?.data?.message || 'Ошибка');
            }
        } else {
            // Office employee invite
            // Automatically determine system role from custom position and permissions
            const lower = (values.position || '').toLowerCase();
            const perms = values.permissions || [];
            let systemRole = selectedRole;

            const payload = {
                email: values.email,
                role: systemRole,
                position: values.position,
                departmentId: values.departmentId,
                permissions: perms,
            };

            try {
                const res = await api.post('/company/invitations', payload);
                message.success('Приглашение создано');
                const link = `${window.location.origin}/invite?token=${res.data.token}`;
                setGeneratedLink(link);
                // Reset standard fields but keep generated link
                unifiedForm.resetFields(['email', 'position', 'departmentId', 'permissions']);
                fetchData();
            } catch (error: any) {
                message.error(error.response?.data?.message || 'Ошибка');
            }
        }
    };

    const handleOpenUnifiedModal = (record?: CompanyUser) => {
        setGeneratedLink(null);
        if (record) {
            // Edit driver
            setEditingRecord(record);
            setSelectedRole(record.role);
            unifiedForm.resetFields();
            unifiedForm.setFieldsValue({
                ...record,
                docIssuedAt: record.docIssuedAt ? dayjs(record.docIssuedAt) : undefined,
                docExpiresAt: record.docExpiresAt ? dayjs(record.docExpiresAt) : undefined,
            });
        } else {
            // Add new
            setEditingRecord(null);
            const defaultRole = activeSegment === 'drivers' ? 'DRIVER' : 'LOGISTICIAN';
            setSelectedRole(defaultRole);
            unifiedForm.resetFields();
            unifiedForm.setFieldsValue({
                role: defaultRole,
                permissions: ['orders'],
            });
        }
        setUnifiedModalOpen(true);
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

    const getDriverTooltipTitle = (u: CompanyUser) => {
        return (
            <div style={{ padding: '6px 4px', fontSize: '12px', lineHeight: '1.5' }}>
                <div style={{ fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 6, marginBottom: 8, fontSize: '13px' }}>
                    Карточка водителя
                </div>
                <div style={{ marginBottom: 4 }}><strong>Телефон:</strong> {u.phone || '—'}</div>
                {u.iin && <div style={{ marginBottom: 4 }}><strong>ИИН:</strong> {u.iin}</div>}
                
                <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.15)' }} />
                
                <div style={{ marginBottom: 4 }}><strong>Транспорт:</strong> {u.vehicleType || '—'} {u.vehicleModel ? `(${u.vehicleModel})` : ''}</div>
                <div style={{ marginBottom: 4 }}><strong>Госномер авто:</strong> {u.vehiclePlate || '—'}</div>
                {u.trailerNumber && <div style={{ marginBottom: 4 }}><strong>Госномер прицепа:</strong> {u.trailerNumber}</div>}
                
                <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.15)' }} />
                
                {u.docNumber ? (
                    <>
                        <div style={{ marginBottom: 4 }}><strong>Документ:</strong> {u.docType === 'ID_CARD' ? 'Удостоверение' : 'Паспорт'}</div>
                        <div style={{ marginBottom: 4 }}><strong>Номер:</strong> №{u.docNumber}</div>
                        {u.docIssuedAt && <div style={{ marginBottom: 4 }}><strong>Выдан:</strong> {dayjs(u.docIssuedAt).format('DD.MM.YYYY')}{u.docIssuedBy ? ` (${u.docIssuedBy})` : ''}</div>}
                        {u.docExpiresAt && <div style={{ marginBottom: 4 }}><strong>Действует до:</strong> {dayjs(u.docExpiresAt).format('DD.MM.YYYY')}</div>}
                    </>
                ) : (
                    <div style={{ fontStyle: 'italic', color: '#9ca3af' }}>Документы не заполнены</div>
                )}
            </div>
        );
    };

    const renderEmployeeNode = (u: CompanyUser, isRoot: boolean = false) => {
        const roleLabel = u.position || roleLabels[u.role] || u.role;
        const roleColor = roleColors[u.role] || '#6b7280';
        const initials = formatNameInitials(u);
        const firstLetter = u.firstName ? u.firstName[0].toUpperCase() : '?';

        return (
            <div className="node-card-container employee-node-container" key={u.id}>
                {/* Actions Toolbar on Hover */}
                <div className="node-actions-toolbar">
                    <Space size={4}>
                        {isRoot && (
                            <>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<PlusOutlined style={{ fontSize: 12 }} />}
                                    title="Добавить отдел"
                                    onClick={() => handleAddSubDeptClick(null)}
                                />
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<UserAddOutlined style={{ fontSize: 12 }} />}
                                    title="Пригласить сотрудника"
                                    onClick={() => handleOpenUnifiedModal()}
                                />
                            </>
                        )}
                        {u.id !== currentUser?.id && (
                            u.role === 'DRIVER' ? (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined style={{ fontSize: 12 }} />}
                                    title="Редактировать водителя"
                                    onClick={() => handleOpenUnifiedModal(u)}
                                />
                            ) : (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<SettingOutlined style={{ fontSize: 12 }} />}
                                    title="Настроить права"
                                    onClick={() => {
                                        setEditingUser(u);
                                        editForm.setFieldsValue({ permissions: u.permissions || [] });
                                        setEditModalOpen(true);
                                    }}
                                />
                            )
                        )}
                        {!isRoot && u.departmentId && (
                            <Button
                                type="text"
                                size="small"
                                icon={<DisconnectOutlined style={{ fontSize: 12, color: '#f59e0b' }} />}
                                title="Убрать из отдела"
                                onClick={() => handleUnassignUser(u.id)}
                            />
                        )}
                        {u.id !== currentUser?.id && u.role !== 'COMPANY_ADMIN' && (
                            <Popconfirm
                                title="Удалить сотрудника из компании?"
                                onConfirm={() => handleDeleteUser(u.id)}
                                okText="Да"
                                cancelText="Нет"
                            >
                                <Button
                                    type="text"
                                    danger
                                    size="small"
                                    icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                                    title="Удалить сотрудника"
                                />
                            </Popconfirm>
                        )}
                    </Space>
                </div>

                {/* Pill-shaped Node Card */}
                {u.role === 'DRIVER' ? (
                    <Tooltip title={getDriverTooltipTitle(u)} color="#1f2937" overlayStyle={{ maxWidth: '320px' }}>
                        <div className="node-card employee-card">
                            <div 
                                className="node-avatar"
                                style={{ backgroundColor: roleColor }}
                            >
                                {firstLetter}
                            </div>
                            <div className="node-info">
                                <span className="node-role-label" style={{ color: roleColor }}>{roleLabel}</span>
                                <span className="node-name-label">{initials}</span>
                                {u.vehiclePlate && (
                                    <span style={{ fontSize: '10px', color: '#6b7280', marginTop: 1, fontWeight: 500 }}>
                                        {u.vehiclePlate}
                                    </span>
                                )}
                            </div>
                        </div>
                    </Tooltip>
                ) : (
                    <div className={`node-card employee-card ${isRoot ? 'root-admin-card' : ''}`}>
                        <div 
                            className="node-avatar"
                            style={{ backgroundColor: roleColor }}
                        >
                            {firstLetter}
                        </div>
                        <div className="node-info">
                            <span className="node-role-label" style={{ color: roleColor }}>{roleLabel}</span>
                            <span className="node-name-label">{initials}</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderDeptNode = (dept: any) => {
        const subDepts = getSubDepartments(dept.id);
        const deptUsers = dept.users || [];
        const hasChildren = subDepts.length > 0 || deptUsers.length > 0;
        const iconColor = deptIconColors[dept.icon] || '#3b82f6';
        const avatarBgColor = `${iconColor}12`; // ~7% opacity
        const avatarBorderColor = `${iconColor}24`; // ~14% opacity

        return (
            <div className="org-tree-child-wrapper" key={dept.id}>
                {/* Connector line from sibling bar down */}
                <div className="org-tree-child-wrapper-card-line"></div>

                {/* Pill-shaped Department Card */}
                <div className="node-card-container dept-node-container">
                    {/* Actions Toolbar on Hover */}
                    <div className="node-actions-toolbar">
                        <Space size={4}>
                            <Button
                                type="text"
                                size="small"
                                icon={<PlusOutlined style={{ fontSize: 12 }} />}
                                title="Добавить подотдел"
                                onClick={() => handleAddSubDeptClick(dept.id)}
                            />
                            <Button
                                type="text"
                                size="small"
                                icon={<UserAddOutlined style={{ fontSize: 12 }} />}
                                title="Назначить сотрудника"
                                onClick={() => handleAssignUserClick(dept.id)}
                            />
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined style={{ fontSize: 12 }} />}
                                title="Редактировать отдел"
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
                                    icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                                    title="Удалить отдел"
                                />
                            </Popconfirm>
                        </Space>
                    </div>

                    {/* Node Card UI */}
                    <div className="node-card dept-card">
                        <div 
                            className="node-avatar dept-icon-avatar"
                            style={{
                                backgroundColor: avatarBgColor,
                                borderColor: avatarBorderColor,
                                color: iconColor
                            }}
                        >
                            {renderDeptIcon(dept.icon, 18)}
                        </div>
                        <div className="node-info">
                            <span className="node-role-label dept-role-label" style={{ color: iconColor }}>Отдел</span>
                            <span className="node-name-label">{dept.name}</span>
                        </div>
                    </div>
                </div>

                {/* Subdepartments and employees rendered recursively below */}
                {hasChildren && (
                    <div className="org-tree-children-container">
                        {/* Render employees first */}
                        {deptUsers.map((u: any) => (
                            <div className="org-tree-child-wrapper" key={u.id}>
                                <div className="org-tree-child-wrapper-card-line"></div>
                                {renderEmployeeNode(u, false)}
                            </div>
                        ))}
                        {/* Render subdepartments next */}
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
                <div className="org-tree-container-bg"></div>
                {/* Root Administrators Row */}
                <div className="org-tree-root-row">
                    {adminUsers.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '8px 16px', background: '#fff', borderRadius: 20, border: '1px dashed #d1d5db' }}>
                            Нет назначенных админов
                        </div>
                    ) : (
                        adminUsers.map(u => (
                            <div className="org-tree-root-card-wrapper" key={u.id}>
                                {renderEmployeeNode(u, true)}
                                <div className="org-tree-root-card-line"></div>
                            </div>
                        ))
                    )}
                </div>

                {rootDepts.length > 0 && (
                    <>
                        <div className="org-tree-root-to-children-line"></div>
                        <div className="org-tree-children-container">
                            {rootDepts.map(sd => renderDeptNode(sd))}
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ==================== Active Tables config ====================

    // ==================== Active Tables config ====================

    const driverColumns = [
        {
            title: 'ФИО',
            key: 'name',
            render: (_: any, record: CompanyUser) => `${record.lastName || ''} ${record.firstName || ''} ${record.middleName || ''}`.trim(),
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
        },
        {
            title: 'Госномер авто',
            dataIndex: 'vehiclePlate',
            key: 'vehiclePlate',
            render: (val: string) => val || <Text type="secondary">—</Text>,
        },
        {
            title: 'Тип ТС',
            dataIndex: 'vehicleType',
            key: 'vehicleType',
            render: (val: string) => val || <Text type="secondary">—</Text>,
        },
        {
            title: 'Прицеп',
            dataIndex: 'trailerNumber',
            key: 'trailerNumber',
            render: (val: string) => val || <Text type="secondary">—</Text>,
        },
        {
            title: 'ИИН',
            dataIndex: 'iin',
            key: 'iin',
            render: (val: string) => val || <Text type="secondary">—</Text>,
        },
        {
            title: 'Документы',
            key: 'docs',
            render: (_: any, record: CompanyUser) => {
                if (!record.docNumber) return <Text type="secondary">—</Text>;
                return (
                    <span>
                        {record.docType === 'ID_CARD' ? 'Уд. личн.' : 'Паспорт'} №{record.docNumber}
                        {record.docExpiresAt && ` (до ${dayjs(record.docExpiresAt).format('DD.MM.YYYY')})`}
                    </span>
                );
            }
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: CompanyUser) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => handleOpenUnifiedModal(record)}
                    />
                    <Popconfirm
                        title="Удалить водителя?"
                        onConfirm={() => handleDeleteUser(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </Space>
            )
        }
    ];

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
            key: 'role',
            render: (_: any, record: CompanyUser) => record.position || roleLabels[record.role] || record.role,
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
                    {record.id !== currentUser?.id && record.role !== 'COMPANY_ADMIN' && (
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
            key: 'role',
            render: (_: any, record: Invitation) => record.position || roleLabels[record.role] || record.role,
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
        u => !u.departmentId && u.role !== 'COMPANY_ADMIN' && u.role !== 'ADMIN' && u.role !== 'DRIVER'
    );

    return (
        <div className="company-structure-page">
            {/* Elegant Background Dot Grid Pattern for modern aesthetics */}
            <style>{`
                .org-tree-container {
                    position: relative;
                    width: 100%;
                    height: 600px;
                    overflow: auto;
                    padding: 60px 40px;
                    background-color: #ffffff;
                    border: none;
                    min-height: 480px;
                    border-radius: 16px;
                }
                
                .org-tree-container-bg {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    pointer-events: none;
                    background-image: radial-gradient(rgba(0, 0, 0, 0.18) 1.2px, transparent 1.2px);
                    background-size: 22px 22px;
                    z-index: 1;
                    mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%);
                    -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%);
                }
                
                .org-tree {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    margin: 0 auto;
                    width: max-content;
                    min-width: 100%;
                }
                
                /* Root administrators row */
                .org-tree-root-row {
                    display: flex;
                    justify-content: center;
                    position: relative;
                    padding-bottom: 0;
                    width: max-content;
                    flex-shrink: 0;
                    z-index: 2;
                }
                
                .org-tree-root-card-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 0 20px;
                    position: relative;
                    flex-shrink: 0;
                }
                
                .org-tree-root-card-wrapper::before,
                .org-tree-root-card-wrapper::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    width: 50%;
                    height: 2px;
                    background: linear-gradient(90deg, #c7d2fe, #a5b4fc);
                }
                
                .org-tree-root-card-wrapper::before {
                    right: 50%;
                }
                
                .org-tree-root-card-wrapper::after {
                    left: 50%;
                }
                
                .org-tree-root-card-wrapper:only-child::before,
                .org-tree-root-card-wrapper:only-child::after {
                    display: none;
                }
                
                .org-tree-root-card-wrapper:first-child::before {
                    display: none;
                }
                
                .org-tree-root-card-wrapper:last-child::after {
                    display: none;
                }
                
                .org-tree-root-card-line {
                    width: 2px;
                    height: 28px;
                    background: linear-gradient(180deg, #c7d2fe, #a5b4fc);
                }
                
                .org-tree-root-to-children-line {
                    width: 2px;
                    height: 28px;
                    background: linear-gradient(180deg, #a5b4fc, #c7d2fe);
                    position: relative;
                    z-index: 2;
                }
                
                /* Child wrappers and hierarchy connectors */
                .org-tree-children-container {
                    display: flex;
                    padding-top: 28px;
                    position: relative;
                    width: max-content;
                    flex-shrink: 0;
                    z-index: 2;
                }
                
                .org-tree-children-container::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 50%;
                    width: 2px;
                    height: 28px;
                    background: linear-gradient(180deg, #c7d2fe, #a5b4fc);
                }
                
                .org-tree-child-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 0 16px;
                    position: relative;
                    flex-shrink: 0;
                }
                
                .org-tree-child-wrapper::before,
                .org-tree-child-wrapper::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    width: 50%;
                    height: 2px;
                    background: linear-gradient(90deg, #c7d2fe, #a5b4fc);
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
                    height: 28px;
                    background: linear-gradient(180deg, #c7d2fe, #a5b4fc);
                }
                
                /* Card Nodes */
                .node-card-container {
                    position: relative;
                    padding: 6px 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 2;
                }
                
                .node-card {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 240px;
                    height: 68px;
                    padding: 10px 16px;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 16px;
                    box-shadow: none;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: default;
                }
                
                .node-card-container:hover .node-card {
                    transform: translateY(-3px);
                    background: rgba(255, 255, 255, 0.7);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border-color: rgba(199, 210, 254, 0.5);
                    box-shadow: 0 8px 32px rgba(99, 102, 241, 0.08);
                }
                
                /* Root Admin node */
                .root-admin-card {
                    border: none;
                    box-shadow: none;
                    background: transparent;
                }
                
                /* Department node */
                .dept-card {
                    border: none;
                    box-shadow: none;
                    background: transparent;
                }
                
                /* Node Avatars */
                .node-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #ffffff;
                    font-weight: 700;
                    font-size: 16px;
                    margin-right: 14px;
                    flex-shrink: 0;
                    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
                    transition: all 0.25s ease;
                }
                
                .node-card-container:hover .node-avatar {
                    transform: scale(1.08);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
                }
                
                .dept-icon-avatar {
                    font-size: 20px;
                    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.15);
                    border: 2px solid rgba(255, 255, 255, 0.8);
                }
                
                .node-card-container:hover .dept-icon-avatar {
                    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.25);
                }
                
                /* Node details */
                .node-info {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    min-width: 0;
                    text-align: left;
                }
                
                .node-role-label {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    line-height: 1.2;
                    margin-bottom: 3px;
                }
                
                .dept-role-label {
                    color: #3b82f6;
                }
                
                .node-name-label {
                    font-size: 14px;
                    font-weight: 700;
                    color: #111827;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.3;
                }
                
                /* Float Actions Toolbar on Hover */
                .node-actions-toolbar {
                    position: absolute;
                    top: -12px;
                    background: rgba(255, 255, 255, 0.88);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    border-radius: 22px;
                    padding: 3px 8px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(99, 102, 241, 0.06);
                    opacity: 0;
                    pointer-events: none;
                    transform: translateY(6px);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    z-index: 10;
                    display: flex;
                    align-items: center;
                }
                
                .node-actions-toolbar .ant-btn {
                    padding: 0;
                    width: 26px;
                    height: 26px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    color: #4b5563;
                    transition: all 0.15s ease;
                }
                
                .node-actions-toolbar .ant-btn:hover {
                    background: rgba(99, 102, 241, 0.08);
                    color: #4f46e5;
                }
                
                .node-actions-toolbar .ant-btn-dangerous:hover {
                    background: #fef2f2;
                    color: #ef4444;
                }
                
                .node-card-container:hover .node-actions-toolbar {
                    opacity: 1;
                    pointer-events: auto;
                    transform: translateY(0);
                }
                
                /* Center button pulse */
                @keyframes centerBtnPulse {
                    0%, 100% { box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15); }
                    50% { box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3); }
                }
                
                .center-view-btn {
                    animation: centerBtnPulse 3s ease-in-out infinite;
                }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>Персонал</Title>
                    <Text type="secondary">Управление структурой, сотрудниками и водителями</Text>
                </div>
                <Space>
                    <Segmented
                        value={activeSegment}
                        onChange={(value) => {
                            setActiveSegment(value as 'office' | 'drivers');
                            if (value === 'drivers') {
                                setViewMode('list');
                            }
                        }}
                        options={[
                            { label: 'Офис', value: 'office' },
                            { label: 'Водители', value: 'drivers' }
                        ]}
                        size="middle"
                        style={{ marginRight: 8 }}
                    />
                    {activeSegment === 'office' && (
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
                    )}
                    {activeSegment === 'drivers' ? (
                        <Button type="primary" icon={<CarOutlined />} onClick={() => handleOpenUnifiedModal()}>
                            Добавить водителя
                        </Button>
                    ) : (
                        <Button type="primary" icon={<MailOutlined />} onClick={() => handleOpenUnifiedModal()}>
                            Пригласить
                        </Button>
                    )}
                </Space>
            </div>

            {viewMode === 'tree' ? (
                <Row gutter={20}>
                    <Col xs={24} lg={18}>
                        <div style={{ position: 'relative', width: '100%', border: 'none' }}>
                            <div className="org-tree-container" ref={treeContainerRef}>
                                {users.length === 0 ? (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Пользователи не найдены"
                                    />
                                ) : (
                                    renderRootNode()
                                )}
                            </div>
                            <Button
                                type="default"
                                shape="circle"
                                icon={<AimOutlined />}
                                onClick={handleCenterView}
                                className="center-view-btn"
                                style={{
                                    position: 'absolute',
                                    bottom: 20,
                                    right: 20,
                                    zIndex: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 38,
                                    height: 38,
                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                    color: '#6366f1',
                                }}
                                title="Центрировать схему"
                            />
                        </div>
                    </Col>
                    <Col xs={24} lg={6}>
                        <Card 
                            title={
                                <span style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
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
                                                padding: '6px 8px',
                                                background: '#f9fafb',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: 8,
                                                marginBottom: 6
                                            }}
                                        >
                                            <Space size={8}>
                                                <div
                                                    style={{
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: '50%',
                                                        background: roleColors[u.role] || '#6b7280',
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
                                                <div>
                                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937' }}>
                                                        {u.lastName} {u.firstName}
                                                    </div>
                                                    <Tag color={roleColors[u.role]} style={{ fontSize: 8, margin: 0, padding: '0 4px', lineHeight: '12px', height: '14px', borderRadius: 4 }}>
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
                        <Tabs.TabPane tab={activeSegment === 'drivers' ? `Водители (${filteredUsers.length})` : `Активные (${filteredUsers.length})`} key="1">
                            <Table
                                columns={activeSegment === 'drivers' ? driverColumns : userColumns}
                                dataSource={filteredUsers}
                                rowKey="id"
                                loading={loading}
                                pagination={{ pageSize: 10 }}
                            />
                        </Tabs.TabPane>
                        {activeSegment === 'office' && (
                            <Tabs.TabPane tab={`Приглашения (${invitations.length})`} key="2">
                                <Table
                                    columns={invitationColumns}
                                    dataSource={invitations}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={{ pageSize: 10 }}
                                />
                            </Tabs.TabPane>
                        )}
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
                        <Input placeholder="Например: Бухгалтерия" maxLength={100} />
                    </Form.Item>
                    <Form.Item
                        name="icon"
                        label="Иконка отдела"
                        initialValue="FolderOpenOutlined"
                    >
                        <Select dropdownMatchSelectWidth={false}>
                            {iconOptions.map(opt => (
                                <Select.Option key={opt.value} value={opt.value}>
                                    <Space>
                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                            {renderDeptIcon(opt.value, 16)}
                                        </span>
                                        <span>{opt.label}</span>
                                    </Space>
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Rename/Edit Department */}
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
                        <Input placeholder="Например: Отдел логистики" maxLength={100} />
                    </Form.Item>
                    <Form.Item
                        name="icon"
                        label="Иконка отдела"
                    >
                        <Select dropdownMatchSelectWidth={false}>
                            {iconOptions.map(opt => (
                                <Select.Option key={opt.value} value={opt.value}>
                                    <Space>
                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                            {renderDeptIcon(opt.value, 16)}
                                        </span>
                                        <span>{opt.label}</span>
                                    </Space>
                                </Select.Option>
                            ))}
                        </Select>
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

            {/* Modal: Unified Invite / Create / Edit Modal */}
            <Modal
                title={
                    editingRecord
                        ? "Редактирование водителя"
                        : selectedRole === 'DRIVER'
                            ? "Добавление водителя"
                            : "Приглашение сотрудника"
                }
                open={unifiedModalOpen}
                onCancel={() => {
                    setUnifiedModalOpen(false);
                    setEditingRecord(null);
                    unifiedForm.resetFields();
                }}
                footer={
                    generatedLink
                        ? [
                              <Button
                                  key="close"
                                  type="primary"
                                  onClick={() => {
                                      setUnifiedModalOpen(false);
                                      setGeneratedLink(null);
                                  }}
                              >
                                  Готово
                              </Button>
                          ]
                        : [
                              <Button
                                  key="cancel"
                                  onClick={() => {
                                      setUnifiedModalOpen(false);
                                      setEditingRecord(null);
                                      unifiedForm.resetFields();
                                  }}
                              >
                                  Отмена
                              </Button>,
                              <Button
                                  key="submit"
                                  type="primary"
                                  onClick={() => unifiedForm.submit()}
                              >
                                  {editingRecord
                                      ? "Сохранить"
                                      : selectedRole === 'DRIVER'
                                          ? "Создать"
                                          : "Создать ссылку"}
                              </Button>
                          ]
                }
                width={selectedRole === 'DRIVER' ? 650 : 500}
                destroyOnClose
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
                    <Form
                        form={unifiedForm}
                        layout="vertical"
                        onFinish={handleUnifiedSubmit}
                    >
                        {!editingRecord && (
                            <Form.Item
                                name="role"
                                label="Роль / Тип"
                                rules={[{ required: true, message: 'Выберите роль' }]}
                            >
                                <Select
                                    onChange={(val) => setSelectedRole(val)}
                                    placeholder="Выберите роль"
                                >
                                    {ROLE_OPTIONS.map(opt => (
                                        <Select.Option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        )}

                        {selectedRole === 'DRIVER' ? (
                            <>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            name="lastName"
                                            label="Фамилия"
                                            rules={[{ required: true, message: 'Обязательное поле' }]}
                                        >
                                            <Input placeholder="Иванов" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            name="firstName"
                                            label="Имя"
                                            rules={[{ required: true, message: 'Обязательное поле' }]}
                                        >
                                            <Input placeholder="Иван" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item name="middleName" label="Отчество">
                                    <Input placeholder="Иванович" />
                                </Form.Item>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            name="phone"
                                            label="Телефон"
                                            rules={[
                                                { required: true, message: 'Обязательное поле' },
                                                { pattern: /^(\+7|8)\d{10}$/, message: 'Формат: +7XXXXXXXXXX' }
                                            ]}
                                        >
                                            <Input placeholder="+77001234567" disabled={!!editingRecord} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            name="iin"
                                            label="ИИН"
                                            rules={[
                                                { required: true, message: 'Введите ИИН' },
                                                { pattern: /^\d{12}$/, message: 'ИИН должен содержать 12 цифр' }
                                            ]}
                                        >
                                            <Input placeholder="123456789012" maxLength={12} />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Divider><CarOutlined style={{ marginRight: 6 }} />Транспорт</Divider>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item name="vehicleType" label="Тип транспорта">
                                            <Select
                                                placeholder="Тент, Реф..."
                                                allowClear
                                                showSearch
                                                optionFilterProp="children"
                                            >
                                                {VEHICLE_TYPES.map(t => (
                                                    <Select.Option key={t} value={t}>{t}</Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item name="vehicleModel" label="Модель автомобиля">
                                            <Input placeholder="Volvo FH16" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            name="vehiclePlate"
                                            label="Гос. номер авто"
                                            rules={[{ required: true, message: 'Введите гос. номер' }]}
                                        >
                                            <Input placeholder="A123BC01" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            name="trailerNumber"
                                            label="Номер прицепа"
                                        >
                                            <Input placeholder="AB1234" />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Divider><IdcardOutlined style={{ marginRight: 6 }} />Документ, удостоверяющий личность</Divider>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            name="docType"
                                            label="Вид документа"
                                            rules={[{ required: true, message: 'Выберите тип документа' }]}
                                        >
                                            <Select placeholder="Выберите тип" allowClear>
                                                <Select.Option value="ID_CARD">Удостоверение личности</Select.Option>
                                                <Select.Option value="PASSPORT">Паспорт</Select.Option>
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            name="docNumber"
                                            label="Номер документа"
                                            rules={[{ required: true, message: 'Введите номер' }]}
                                        >
                                            <Input placeholder="012345678" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Form.Item
                                            name="docIssuedAt"
                                            label="Дата выдачи"
                                        >
                                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="01.01.2020" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item
                                            name="docExpiresAt"
                                            label="Действителен до"
                                        >
                                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="01.01.2030" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item
                                    name="docIssuedBy"
                                    label="Кем выдан"
                                >
                                    <Input placeholder="МВД РК / РОВД г. Алматы" />
                                </Form.Item>
                            </>
                        ) : (
                            <>
                                <Form.Item name="email" label="Email сотрудника" rules={[{ required: true, type: 'email' }]}>
                                    <Input placeholder="employee@company.kz" />
                                </Form.Item>
                                <Form.Item
                                    name="position"
                                    label="Должность"
                                    rules={[{ required: true, message: 'Введите название роли/должности' }]}
                                >
                                    <Input placeholder="Например: Менеджер, Бухгалтер, Завсклад" />
                                </Form.Item>
                                <Form.Item name="departmentId" label="Отдел (опционально)">
                                    <Select
                                        placeholder="Выберите отдел или создайте новый"
                                        allowClear
                                        dropdownMatchSelectWidth={false}
                                        dropdownRender={(menu) => (
                                            <>
                                                {menu}
                                                <Divider style={{ margin: '8px 0' }} />
                                                <div style={{ display: 'flex', gap: 8, padding: '0 8px 4px' }}>
                                                    <Input
                                                        placeholder="Новый отдел"
                                                        value={newDeptName}
                                                        onChange={e => setNewDeptName(e.target.value)}
                                                        onKeyDown={e => e.stopPropagation()}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <Button
                                                        type="text"
                                                        icon={<PlusOutlined />}
                                                        onClick={handleInlineCreateDept}
                                                        loading={addingDeptLoading}
                                                        style={{ color: '#4f46e5', fontWeight: 500 }}
                                                    >
                                                        Создать
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    >
                                        {departments.map(dept => (
                                            <Select.Option key={dept.id} value={dept.id}>
                                                <Space>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                        {renderDeptIcon(dept.icon || 'FolderOpenOutlined', 14)}
                                                    </span>
                                                    <span>{dept.name}</span>
                                                </Space>
                                            </Select.Option>
                                        ))}
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
                            </>
                        )}
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
