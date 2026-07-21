'use client';

import { useEffect, useState, useRef } from 'react';
import { Table, Card, Button, Tag, Modal, Form, Input, Select, message, Typography, Space, Popconfirm, Tabs, Alert, Checkbox, Radio, Divider, Empty, Row, Col, DatePicker, Tooltip, Segmented, Switch } from 'antd';
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
import UserAvatar from '@/components/UserAvatar';

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
    avatarPath?: string | null;
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

// Склонение слова «отдел» по числу: 1 отдел, 2 отдела, 5 отделов
const pluralizeDepartments = (n: number) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'отдел';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'отдела';
    return 'отделов';
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
    const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
    const [activeSegment, setActiveSegment] = useState<'office' | 'drivers'>('office');
    const [zoom, setZoom] = useState(1);

    const treeContainerRef = useRef<HTMLDivElement>(null);

    const ZOOM_MIN = 0.4;
    const ZOOM_MAX = 1.6;
    const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, +(z + 0.1).toFixed(2)));
    const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - 0.1).toFixed(2)));

    const handleCenterView = () => {
        setZoom(1);
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
    const [myCompanies, setMyCompanies] = useState<any[]>([]);

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
            const [usersRes, invRes, deptsRes, profileRes, companiesRes] = await Promise.all([
                api.get('/company/users'),
                api.get('/company/invitations'),
                api.get('/company/departments').catch(() => ({ data: [] })),
                api.get('/company/profile').catch(() => ({ data: null })),
                api.get('/company/my-companies').catch(() => ({ data: [] })),
            ]);
            setUsers(Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data.data || []));
            setInvitations(invRes.data || []);
            setDepartments(deptsRes.data || []);
            setMyCompanies(Array.isArray(companiesRes.data) ? companiesRes.data : []);
            if (profileRes.data && profileRes.data.name) {
                setCompanyName(profileRes.data.name);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Права менеджеров (что видят логисты) — настройки компании
    const [rightsModalOpen, setRightsModalOpen] = useState(false);
    const [managerToggles, setManagerToggles] = useState({ orders: true, partners: false });
    const [toggleSaving, setToggleSaving] = useState(false);

    const saveManagerToggle = async (key: 'orders' | 'partners', value: boolean) => {
        const prev = managerToggles;
        setManagerToggles({ ...prev, [key]: value });
        setToggleSaving(true);
        try {
            await api.put('/company/profile', key === 'orders'
                ? { managersSeeOwnOrdersOnly: value }
                : { managersSeeOwnPartnersOnly: value });
            message.success('Настройка сохранена');
        } catch (e: any) {
            setManagerToggles(prev);
            message.error(e.response?.data?.message || 'Не удалось сохранить настройку');
        } finally {
            setToggleSaving(false);
        }
    };

    useEffect(() => {
        fetchData();
        api.get('/company/profile')
            .then(res => setManagerToggles({
                orders: res.data?.managersSeeOwnOrdersOnly !== false,
                partners: res.data?.managersSeeOwnPartnersOnly === true,
            }))
            .catch(() => { });
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const seg = params.get('segment');
            if (seg === 'drivers') {
                setActiveSegment('drivers');
                setViewMode('list');
            } else if (seg === 'office') {
                setActiveSegment('office');
            }
            // Открыть окно «Права менеджеров» по ссылке из Кабинета
            if (params.get('rights') === '1') {
                setActiveSegment('office');
                setRightsModalOpen(true);
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

        // Масштабирование колесом с зажатым Ctrl/⌘ (как в Figma/Miro)
        const handleWheel = (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
        };

        container.style.cursor = 'grab';
        container.addEventListener('mousedown', handleMouseDown);
        container.addEventListener('mouseleave', handleMouseLeave);
        container.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('mousedown', handleMouseDown);
            container.removeEventListener('mouseleave', handleMouseLeave);
            container.removeEventListener('mouseup', handleMouseUp);
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('wheel', handleWheel);
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

            const payload: any = {
                email: values.email,
                role: systemRole,
                position: values.position,
                departmentId: values.departmentId,
                permissions: perms,
            };
            // Мультикомпания: в какие организации дать доступ (если у владельца их несколько)
            if (myCompanies.length > 1 && Array.isArray(values.sharedCompanyIds)) {
                payload.sharedCompanyIds = values.sharedCompanyIds;
            }

            try {
                const res = await api.post('/company/invitations', payload);
                if (res.data.emailSent) {
                    message.success(`Приглашение отправлено на ${payload.email}`);
                } else {
                    message.warning('Приглашение создано, но письмо не отправлено — передайте ссылку вручную');
                }
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
                // По умолчанию доступ во все организации владельца («общая команда»)
                sharedCompanyIds: myCompanies.map((c: any) => c.id),
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

        const avatarNode = (
            <UserAvatar
                userId={u.id}
                hasAvatar={!!u.avatarPath}
                size={48}
                className="node-avatar node-avatar-photo"
                fallback={
                    <div
                        className="node-avatar"
                        style={{ backgroundColor: roleColor }}
                    >
                        {firstLetter}
                    </div>
                }
            />
        );

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
                            {avatarNode}
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
                        {avatarNode}
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
        // Сотрудники больше не «висят» в схеме — они показываются в панели справа
        // при клике на отдел. В самом дереве строятся только подотделы.
        const hasChildren = subDepts.length > 0;
        const isSelected = selectedDeptId === dept.id;
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

                    {/* Карточка отдела — клик открывает список сотрудников справа */}
                    <div
                        className={`dept-card2${isSelected ? ' dept-card2-selected' : ''}`}
                        onClick={() => setSelectedDeptId(isSelected ? null : dept.id)}
                        style={{ ['--dept-accent' as any]: iconColor }}
                    >
                        <div className="dept-card2-head">
                            <div
                                className="dept-card2-icon"
                                style={{ backgroundColor: avatarBgColor, borderColor: avatarBorderColor, color: iconColor }}
                            >
                                {renderDeptIcon(dept.icon, 18)}
                            </div>
                            <div className="dept-card2-title">{dept.name}</div>
                        </div>
                        <div className="dept-card2-row">
                            <span className="dept-card2-row-label">Сотрудники</span>
                            <span className="dept-card2-row-badge">{deptUsers.length}</span>
                        </div>
                        <div className="dept-card2-foot">
                            {subDepts.length > 0
                                ? `${subDepts.length} ${pluralizeDepartments(subDepts.length)} внутри`
                                : 'нет вложенных отделов'}
                        </div>
                    </div>
                </div>

                {/* В дереве строятся только подотделы; сотрудники — в панели справа */}
                {hasChildren && (
                    <div className="org-tree-children-container">
                        {subDepts.map(sd => renderDeptNode(sd))}
                    </div>
                )}
            </div>
        );
    };

    const renderRootNode = () => {
        const rootDepts = getSubDepartments(null);
        // В корне — только админы БЕЗ отдела; админ, назначенный в отдел, отображается внутри него
        const adminUsers = users.filter(u => u.role === 'COMPANY_ADMIN' && !(u as any).departmentId);

        return (
            <div className="org-tree">
                <div className="org-tree-container-bg"></div>
                {/* Root Administrators Row */}
                <div className="org-tree-root-row">
                    {adminUsers.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--lc-text-ter)', fontSize: 11, padding: '8px 16px', background: 'var(--lc-card)', borderRadius: 20, border: '1px dashed var(--lc-border)' }}>
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

    // Filtered users list for tables
    const filteredUsers = activeSegment === 'drivers'
        ? users.filter(u => u.role === 'DRIVER')
        : users.filter(u => u.role !== 'DRIVER');

    // Unassigned users list
    const unassignedUsers = users.filter(
        u => !u.departmentId && u.role !== 'COMPANY_ADMIN' && u.role !== 'ADMIN' && u.role !== 'DRIVER'
    );

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* Elegant Background Dot Grid Pattern for modern aesthetics */}
            <style>{`
                .org-tree-container {
                    position: relative;
                    width: 100%;
                    height: 600px;
                    overflow: auto;
                    padding: 60px 40px;
                    background-color: var(--lc-card);
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
                    background-image: radial-gradient(rgba(140, 140, 140, 0.20) 1.2px, transparent 1.2px);
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
                    transform: scale(var(--tree-zoom, 1));
                    transform-origin: top center;
                    transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
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
                    background: var(--lc-border);
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
                    background: var(--lc-border);
                }
                
                .org-tree-root-to-children-line {
                    width: 2px;
                    height: 28px;
                    background: var(--lc-border);
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
                    transform: translateX(-50%);
                    width: 2px;
                    height: 28px;
                    background: var(--lc-border);
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
                    background: var(--lc-border);
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
                    background: var(--lc-border);
                    position: relative;
                }
                /* Стрелка вниз — в блок отдела */
                .org-tree-child-wrapper-card-line::after {
                    content: '';
                    position: absolute;
                    bottom: -1px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 0;
                    height: 0;
                    border-left: 4px solid transparent;
                    border-right: 4px solid transparent;
                    border-top: 6px solid var(--lc-border);
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
                    justify-content: flex-start;
                    width: 240px;
                    height: 68px;
                    padding: 10px 16px;
                    background: var(--lc-card);
                    border: 1px solid var(--lc-border);
                    border-radius: 18px;
                    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: default;
                }

                .node-card-container:hover .node-card {
                    transform: translateY(-3px);
                    border-color: rgba(22, 119, 255, 0.35);
                    box-shadow: 0 10px 28px rgba(22, 119, 255, 0.10), 0 2px 8px rgba(16, 24, 40, 0.06);
                }

                /* Root Admin node — акцентное кольцо */
                .root-admin-card {
                    border-color: rgba(22, 119, 255, 0.35);
                    box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.08), 0 1px 2px rgba(16, 24, 40, 0.04);
                }

                /* Department node */
                .dept-card {
                    background: var(--lc-hover);
                    border: 1px dashed var(--lc-border);
                    box-shadow: none;
                }

                /* Карточка отдела 2.0 — структурированный вид (ближе к 1С/Битрикс) */
                .dept-card2 {
                    width: 264px;
                    background: var(--lc-card);
                    border: 1px solid var(--lc-border);
                    border-radius: 16px;
                    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
                    padding: 14px 16px 12px;
                    cursor: pointer;
                    text-align: left;
                    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, border-color 0.2s ease;
                }
                .node-card-container:hover .dept-card2 {
                    transform: translateY(-3px);
                    border-color: rgba(22, 119, 255, 0.35);
                    box-shadow: 0 10px 28px rgba(22, 119, 255, 0.10), 0 2px 8px rgba(16, 24, 40, 0.06);
                }
                .dept-card2-selected {
                    border-color: var(--dept-accent, #1677ff);
                    box-shadow: 0 0 0 2px var(--dept-accent, #1677ff), 0 8px 22px rgba(22, 119, 255, 0.10);
                }
                .dept-card2-head {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                }
                .dept-card2-icon {
                    width: 34px;
                    height: 34px;
                    border-radius: 10px;
                    border: 1px solid;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .dept-card2-title {
                    font-size: 14px;
                    font-weight: 700;
                    color: var(--lc-text);
                    letter-spacing: -0.01em;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .dept-card2-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 7px 12px;
                    background: var(--lc-hover);
                    border-radius: 10px;
                }
                .dept-card2-row-label {
                    font-size: 12px;
                    color: var(--lc-text-ter);
                }
                .dept-card2-row-badge {
                    font-size: 12px;
                    font-weight: 700;
                    color: var(--lc-text);
                    background: var(--lc-card);
                    border: 1px solid var(--lc-border);
                    border-radius: 8px;
                    padding: 1px 10px;
                    min-width: 24px;
                    text-align: center;
                }
                .dept-card2-foot {
                    margin-top: 10px;
                    padding-top: 9px;
                    border-top: 1px dashed var(--lc-border);
                    font-size: 11px;
                    color: var(--lc-text-ter);
                }

                /* Правая панель — список людей отдела */
                .org-side-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    color: var(--lc-text-ter);
                    margin-bottom: 8px;
                }
                .org-side-group span {
                    font-size: 10px;
                    font-weight: 700;
                    color: var(--lc-text-ter);
                    background: var(--lc-hover);
                    border-radius: 999px;
                    padding: 0 7px;
                    line-height: 16px;
                }
                .org-side-person {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 7px 8px;
                    border-radius: 12px;
                    margin-bottom: 2px;
                    transition: background 0.15s ease;
                }
                .org-side-person:hover {
                    background: var(--lc-hover);
                }
                .org-side-person-av {
                    width: 34px;
                    height: 34px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    font-weight: 700;
                    font-size: 13px;
                    flex-shrink: 0;
                }
                .org-side-person-name {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--lc-text);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .org-side-person-sub {
                    font-size: 11px;
                    color: var(--lc-text-ter);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
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
                    color: var(--lc-text);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.3;
                }

                /* Фото профиля в узле схемы */
                .node-avatar-photo {
                    background: var(--lc-hover);
                    border: 1px solid var(--lc-border);
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

                /* Зум-контролы схемы */
                .org-zoom-ctrl {
                    position: absolute;
                    bottom: 20px;
                    left: 20px;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    padding: 4px;
                    background: var(--lc-card);
                    border: 1px solid var(--lc-border);
                    border-radius: 12px;
                    box-shadow: 0 4px 14px rgba(16, 24, 40, 0.10);
                }
                .org-zoom-ctrl button {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    border-radius: 8px;
                    font-size: 18px;
                    line-height: 1;
                    color: var(--lc-text-sec, var(--lc-text));
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.15s ease;
                }
                .org-zoom-ctrl button:hover:not(:disabled) {
                    background: var(--lc-hover);
                    color: var(--lc-primary, #1677ff);
                }
                .org-zoom-ctrl button:disabled {
                    opacity: 0.35;
                    cursor: default;
                }
                .org-zoom-val {
                    min-width: 46px;
                    text-align: center;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--lc-text);
                    cursor: pointer;
                    font-variant-numeric: tabular-nums;
                    user-select: none;
                }
            `}</style>

            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Кабинет · Сотрудники</div>
                    <h1 className="lc2-title">Персонал</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Управление структурой, сотрудниками и водителями
                    </p>
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
                            <Button type="primary" icon={<CarOutlined />} onClick={() => handleOpenUnifiedModal()} className="lc-cta">
                                Добавить водителя
                            </Button>
                        ) : (
                            <Button type="primary" icon={<MailOutlined />} onClick={() => handleOpenUnifiedModal()} className="lc-cta">
                                Пригласить
                            </Button>
                        )}
                        {activeSegment === 'office' && (
                            <Button icon={<SettingOutlined />} onClick={() => setRightsModalOpen(true)}>
                                Права доступа
                            </Button>
                        )}
                    </Space>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <TeamOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Сотрудники</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {users.filter(u => u.role !== 'DRIVER').length}
                            </div>
                            <div className="lc2-msub">офис</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Водители</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {users.filter(u => u.role === 'DRIVER').length}
                            </div>
                            <div className="lc2-msub">в штате</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: invitations.length > 0 ? '#ffeef0' : '#f1f2f5', color: invitations.length > 0 ? '#dc3545' : '#5f6672' }}>
                            <MailOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Приглашения</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {invitations.length}
                            </div>
                            <div className="lc2-msub" style={{ color: invitations.length > 0 ? '#dc3545' : '#8a91a0' }}>
                                {invitations.length > 0 ? 'ожидают активации' : 'нет активных'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {viewMode === 'tree' ? (
                <Row gutter={20}>
                    <Col xs={24} lg={18}>
                        <div style={{ position: 'relative', width: '100%', border: 'none' }}>
                            <div
                                className="org-tree-container"
                                ref={treeContainerRef}
                                style={{ ['--tree-zoom' as any]: zoom }}
                            >
                                {users.length === 0 ? (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Пользователи не найдены"
                                    />
                                ) : (
                                    renderRootNode()
                                )}
                            </div>

                            {/* Зум-контролы (слева снизу) */}
                            <div className="org-zoom-ctrl">
                                <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} title="Уменьшить">−</button>
                                <span className="org-zoom-val" onClick={() => setZoom(1)} title="Сбросить масштаб">{Math.round(zoom * 100)}%</span>
                                <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title="Увеличить">+</button>
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
                                title="Центрировать и сбросить масштаб"
                            />
                        </div>
                    </Col>
                    <Col xs={24} lg={6}>
                        {(() => {
                            const selectedDept = selectedDeptId ? departments.find((d: any) => d.id === selectedDeptId) : null;
                            const panelUsers: any[] = selectedDept ? (selectedDept.users || []) : unassignedUsers;
                            return (
                                <div className="lc-card" style={{ padding: 12, minHeight: 480, borderRadius: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                        <div style={{ fontWeight: 600, color: 'var(--lc-text)', fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedDept ? (
                                                <><ApartmentOutlined style={{ marginRight: 6, color: 'var(--lc-text-ter)' }} />{selectedDept.name} ({panelUsers.length})</>
                                            ) : (
                                                <><UserOutlined style={{ marginRight: 6, color: 'var(--lc-text-ter)' }} />Нераспределенные ({unassignedUsers.length})</>
                                            )}
                                        </div>
                                        {selectedDept && (
                                            <Button type="text" size="small" onClick={() => setSelectedDeptId(null)} style={{ flexShrink: 0 }}>✕</Button>
                                        )}
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>
                                        {selectedDept
                                            ? 'Сотрудники этого отдела. Нажмите на другой отдел в схеме, чтобы посмотреть его.'
                                            : 'Сотрудники и водители без привязки к отделам. Нажмите на отдел в схеме, чтобы увидеть его состав.'}
                                    </Text>

                                    <div style={{ maxHeight: 440, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
                                        {panelUsers.length === 0 ? (
                                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedDept ? 'В отделе нет сотрудников' : 'Все распределены'} style={{ marginTop: 40 }} />
                                        ) : (() => {
                                            const leaders = panelUsers.filter(u => u.role === 'COMPANY_ADMIN' || u.role === 'FORWARDER');
                                            const members = panelUsers.filter(u => u.role !== 'COMPANY_ADMIN' && u.role !== 'FORWARDER');
                                            const renderPerson = (u: any) => (
                                                <div key={u.id} className="org-side-person">
                                                    <UserAvatar
                                                        userId={u.id}
                                                        hasAvatar={!!u.avatarPath}
                                                        size={34}
                                                        fallback={
                                                            <span className="org-side-person-av" style={{ background: roleColors[u.role] || '#6b7280' }}>
                                                                {(u.firstName?.[0] || '?').toUpperCase()}
                                                            </span>
                                                        }
                                                    />
                                                    <div style={{ minWidth: 0 }}>
                                                        <div className="org-side-person-name">{u.lastName} {u.firstName}</div>
                                                        <div className="org-side-person-sub">{u.position || roleLabels[u.role] || u.role}</div>
                                                    </div>
                                                </div>
                                            );
                                            return (
                                                <>
                                                    {leaders.length > 0 && (
                                                        <>
                                                            <div className="org-side-group">Руководители<span>{leaders.length}</span></div>
                                                            {leaders.map(renderPerson)}
                                                        </>
                                                    )}
                                                    {members.length > 0 && (
                                                        <>
                                                            <div className="org-side-group" style={{ marginTop: leaders.length ? 14 : 0 }}>
                                                                {leaders.length ? 'Сотрудники' : 'Все'}<span>{members.length}</span>
                                                            </div>
                                                            {members.map(renderPerson)}
                                                        </>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );
                        })()}
                    </Col>
                </Row>
            ) : (
                <div className="lc-card" style={{ padding: 20 }}>
                    <Tabs defaultActiveKey="1">
                        <Tabs.TabPane tab={activeSegment === 'drivers' ? `Водители (${filteredUsers.length})` : `Активные (${filteredUsers.length})`} key="1">
                            <Table
                                columns={activeSegment === 'drivers' ? driverColumns : userColumns}
                                dataSource={filteredUsers}
                                rowKey="id"
                                loading={loading}
                                pagination={{ pageSize: 10 }}
                                size="small"
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
                                    size="small"
                                />
                            </Tabs.TabPane>
                        )}
                    </Tabs>
                </div>
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
                                <Form.Item
                                    name="password"
                                    label="Пароль для мобильного приложения"
                                    extra={editingRecord ? 'Оставьте пустым, чтобы не менять пароль' : 'Водитель входит в приложение по телефону и этому паролю'}
                                    rules={[{ min: 6, message: 'Минимум 6 символов' }]}
                                >
                                    <Input.Password placeholder="Минимум 6 символов" autoComplete="new-password" />
                                </Form.Item>

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
                                {myCompanies.length > 1 && (
                                    <Form.Item
                                        name="sharedCompanyIds"
                                        label="Доступ в организациях"
                                        extra="По умолчанию сотрудник работает во всех ваших организациях. Снимите лишние, если нужно ограничить."
                                    >
                                        <Select
                                            mode="multiple"
                                            placeholder="Выберите организации"
                                            options={myCompanies.map((c: any) => ({ label: c.name || 'Без названия', value: c.id }))}
                                        />
                                    </Form.Item>
                                )}
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

            {/* ===== Права доступа (настройки видимости) ===== */}
            <Modal
                title="Права доступа"
                open={rightsModalOpen}
                onCancel={() => setRightsModalOpen(false)}
                footer={<Button type="primary" onClick={() => setRightsModalOpen(false)}>Готово</Button>}
            >
                <p style={{ color: 'var(--lc-text-ter)', fontSize: 12.5, marginBottom: 18 }}>
                    Действует на сотрудников с ролью «Логист/Менеджер». Администраторов и бухгалтеров не ограничивает. Настройка применяется сразу.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Менеджеры видят только свои заявки</div>
                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)', marginTop: 2 }}>
                                Свои — где менеджер ответственный или создатель, плюс свободные (без ответственного). Выключено — видят все заявки компании
                            </div>
                        </div>
                        <Switch checked={managerToggles.orders} loading={toggleSaving} onChange={(v) => saveManagerToggle('orders', v)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Менеджеры видят только своих контрагентов</div>
                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)', marginTop: 2 }}>
                                Свои — где менеджер назначен ответственным (по умолчанию — кто добавил контрагента). Ответственного меняют в справочнике контрагентов
                            </div>
                        </div>
                        <Switch checked={managerToggles.partners} loading={toggleSaving} onChange={(v) => saveManagerToggle('partners', v)} />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
