'use client';

import { Alert, Button, Checkbox, Form, Input, Modal, Select, Tag, Typography, message } from 'antd';
import type { FormInstance } from 'antd';
import { CopyOutlined, MailOutlined, PlusOutlined, SwapOutlined, WhatsAppOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

interface ShareEmail { email: string; checked: boolean; label: string }

interface OrderOperationModalsProps {
    order: any;
    user: any;
    payments: any[];
    statusColors: Record<string, string>;
    statusLabels: Record<string, string>;
    getNextStatuses: (status: string) => { value: string; label: string }[];

    /** Смена статуса рейса */
    statusModalOpen: boolean;
    setStatusModalOpen: (open: boolean) => void;
    statusForm: FormInstance;
    statusLoading: boolean;
    handleStatusChange: (values: any) => void;
    selectedStatusInModal: string | null;
    setSelectedStatusInModal: (status: string | null) => void;

    /** Отклонение завершения рейса второй стороной */
    rejectReasonModalOpen: boolean;
    setRejectReasonModalOpen: (open: boolean) => void;
    rejectReason: string;
    setRejectReason: (reason: string) => void;
    handleRejectCompletion: () => void;
    completionActionLoading: boolean;

    /** Передача ответственного */
    transferModalOpen: boolean;
    setTransferModalOpen: (open: boolean) => void;
    transferUsers: any[];
    transferUserId: string | undefined;
    setTransferUserId: (id: string | undefined) => void;
    transferLoading: boolean;
    handleTransferResponsible: () => void;

    /** Рассылка доверенности */
    sharePoAModalOpen: boolean;
    setSharePoAModalOpen: (open: boolean) => void;
    sharePoALoading: boolean;
    handleSharePoA: () => void;
    shareEmailsList: ShareEmail[];
    setShareEmailsList: (emails: ShareEmail[]) => void;
    customEmailInput: string;
    setCustomEmailInput: (value: string) => void;
    handleAddCustomEmail: () => void;

    /** Ссылка для водителя */
    driverLinkModalOpen: boolean;
    setDriverLinkModalOpen: (open: boolean) => void;
    driverLinkUrl: string;
    driverLinkLoading: boolean;
    regenerateDriverLink: () => void;
    driverPhone: string;
}

/**
 * Окна операций по рейсу: смена статуса, отклонение завершения, передача
 * ответственного, рассылка доверенности и ссылка для водителя.
 *
 * Вынесены из карточки заявки, чтобы она не оставалась файлом на две с
 * половиной тысячи строк. Логика прежняя — состояние и обработчики живут
 * в карточке и приходят пропсами.
 */
export default function OrderOperationModals(props: OrderOperationModalsProps) {
    const {
        order, user, payments, statusColors, statusLabels, getNextStatuses,
        statusModalOpen, setStatusModalOpen, statusForm, statusLoading, handleStatusChange,
        selectedStatusInModal, setSelectedStatusInModal,
        rejectReasonModalOpen, setRejectReasonModalOpen, rejectReason, setRejectReason,
        handleRejectCompletion, completionActionLoading,
        transferModalOpen, setTransferModalOpen, transferUsers, transferUserId, setTransferUserId,
        transferLoading, handleTransferResponsible,
        sharePoAModalOpen, setSharePoAModalOpen, sharePoALoading, handleSharePoA,
        shareEmailsList, setShareEmailsList, customEmailInput, setCustomEmailInput, handleAddCustomEmail,
        driverLinkModalOpen, setDriverLinkModalOpen, driverLinkUrl, driverLinkLoading,
        regenerateDriverLink, driverPhone,
    } = props;

    return (
        <>
        <Modal title="Изменить статус" open={statusModalOpen} onCancel={() => { setStatusModalOpen(false); setSelectedStatusInModal(null); }} onOk={() => statusForm.submit()} okText="Обновить" cancelText="Отмена" confirmLoading={statusLoading}>
            <Form form={statusForm} layout="vertical" onFinish={handleStatusChange}>
                <div style={{ marginBottom: 16 }}>Текущий: <Tag color={statusColors[order.status]}>{statusLabels[order.status]}</Tag></div>
                <Form.Item name="status" label="Новый статус" rules={[{ required: true }]}>
                    <Select placeholder="Статус" size="large" onChange={(val: string) => setSelectedStatusInModal(val)}>
                        {getNextStatuses(order.status).map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
                    </Select>
                </Form.Item>
                {selectedStatusInModal === 'COMPLETED' && (() => {
                    const participantIds = [order.customerCompanyId, order.forwarderId, order.partnerId, order.subForwarderId].filter(Boolean);
                    const uniqueIds = Array.from(new Set(participantIds));
                    const hasOtherRegistered = uniqueIds.some((id: string) => {
                        if (id === user?.companyId) return false;
                        const c = [order.customerCompany, order.forwarder, order.subForwarder, order.partner].find((comp: any) => comp?.id === id);
                        return c && c.isExternal === false;
                    });
                    return hasOtherRegistered ? (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message="Будет отправлен запрос на подтверждение завершения второй стороне"
                            description="Статус не изменится сразу — потребуется подтверждение от другого зарегистрированного участника."
                        />
                    ) : null;
                })()}
                {selectedStatusInModal === 'CANCELLED' && payments.length > 0 && (() => {
                    const paidTotal = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
                    return (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message={`По заявке проведены оплаты на ${paidTotal.toLocaleString('ru-RU')} ₸`}
                            description="При отмене они останутся в учёте — в «Все операции» и ДДС, деньги не пропадут. Если сумму вернут — оформите входящий платёж по контрагенту; если нет — спишите как убыток в «Расходах»."
                        />
                    );
                })()}
                <Form.Item name="comment" label="Комментарий">
                    <TextArea rows={3} placeholder="Причина..." />
                </Form.Item>
            </Form>
        </Modal>

        {/* =================== REJECT COMPLETION MODAL =================== */}
        <Modal
            title="Отклонить завершение рейса"
            open={rejectReasonModalOpen}
            onCancel={() => { setRejectReasonModalOpen(false); setRejectReason(''); }}
            onOk={handleRejectCompletion}
            okText="Отклонить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            confirmLoading={completionActionLoading}
        >
            <div style={{ marginBottom: 12 }}>
                <Text>Укажите причину отклонения (необязательно):</Text>
            </div>
            <TextArea
                rows={3}
                placeholder="Причина отклонения..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
            />
        </Modal>



        {/* =================== SHARE POA MODAL =================== */}
        <Modal
            title="Передать заявку другому менеджеру"
            open={transferModalOpen}
            onCancel={() => { setTransferModalOpen(false); setTransferUserId(undefined); }}
            onOk={handleTransferResponsible}
            okText="Передать"
            cancelText="Отмена"
            confirmLoading={transferLoading}
            okButtonProps={{ disabled: !transferUserId }}
            width={420}
        >
            <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--lc-text-ter)' }}>
                Заявка перейдёт в «Мои заявки» выбранного менеджера. Смена ответственного записывается в журнал действий.
            </div>
            <Select
                style={{ width: '100%' }}
                placeholder="Выберите менеджера"
                showSearch
                optionFilterProp="label"
                value={transferUserId}
                onChange={setTransferUserId}
                options={transferUsers
                    .filter((u: any) => !['DRIVER', 'RECIPIENT'].includes(u.role))
                    .map((u: any) => ({ value: u.id, label: `${u.lastName} ${u.firstName}${u.position ? ` — ${u.position}` : ''}` }))}
            />
        </Modal>

        <Modal title="Отправить доверенность по email" open={sharePoAModalOpen} onCancel={() => setSharePoAModalOpen(false)} onOk={handleSharePoA} okText="Отправить" cancelText="Отмена" confirmLoading={sharePoALoading} width={480}>
            <div style={{ marginBottom: 16 }}>
                <Text type="secondary">Выберите получателей для отправки доверенности (PDF):</Text>
            </div>
            {shareEmailsList.length > 0 ? (
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--lc-border)', borderRadius: 8, padding: 12 }}>
                    {shareEmailsList.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                            <Checkbox
                                checked={item.checked}
                                onChange={(e) => { const newList = [...shareEmailsList]; newList[idx].checked = e.target.checked; setShareEmailsList(newList); }}
                            >
                                <Text style={{ fontSize: 13 }}>{item.label}</Text>
                                <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', paddingLeft: 24 }}>{item.email}</div>
                            </Checkbox>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: 24, background: 'var(--lc-card-2)', borderRadius: 8, marginBottom: 16 }}>
                    <Text type="secondary">Нет email-адресов.</Text>
                </div>
            )}
            <div style={{ borderTop: '1px solid var(--lc-border)', paddingTop: 16 }}>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Добавить получателя вручную:</Text>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Input placeholder="example@mail.com" value={customEmailInput} onChange={(e) => setCustomEmailInput(e.target.value)} onPressEnter={handleAddCustomEmail} />
                    <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddCustomEmail}>Добавить</Button>
                </div>
            </div>
        </Modal>

        {/* =================== INCOME MODAL =================== */}
        <Modal
            title="Ссылка для водителя"
            open={driverLinkModalOpen}
            onCancel={() => setDriverLinkModalOpen(false)}
            footer={null}
            width={520}
        >
            <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, marginTop: 0 }}>
                Отправьте эту ссылку водителю в WhatsApp. Он откроет её на телефоне, увидит адрес и груз (без сумм), включит геолокацию и будет отмечать статусы. Ссылка работает только по этому адресу — храните её в секрете.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Input value={driverLinkUrl} readOnly onFocus={(e) => e.target.select()} />
                <Button type="primary" icon={<CopyOutlined />} onClick={() => { navigator.clipboard?.writeText(driverLinkUrl); message.success('Ссылка скопирована'); }}>Копировать</Button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                    icon={<WhatsAppOutlined />}
                    style={{ background: '#25D366', color: '#fff', borderColor: '#25D366' }}
                    onClick={() => {
                        const text = `Здравствуйте! Ссылка на заявку ${order?.orderNumber}: ${driverLinkUrl}\nОткройте на телефоне, включите геолокацию.`;
                        const phone = (driverPhone ? String(driverPhone) : '').replace(/\D/g, '');
                        window.open(phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }}
                >
                    Отправить в WhatsApp
                </Button>
                <Button icon={<SwapOutlined />} onClick={regenerateDriverLink} loading={driverLinkLoading}>Перевыпустить</Button>
            </div>
        </Modal>
        </>
    );
}
