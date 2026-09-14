'use client';

import { useEffect, useState } from 'react';
import { Button, Empty, Input, Modal, Typography, theme } from 'antd';
import { CopyOutlined, LinkOutlined, SendOutlined, ShareAltOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

const { Text } = Typography;

/**
 * Ссылка контрагенту на взаиморасчёты.
 *
 * По ней контрагент попадает во временный кабинет: видит сделки и долг,
 * выставляет счёт и прикладывает к нему пакет бумаг — накладные, акт, свой
 * счёт. Учётной записи у него при этом нет.
 *
 * Окно вынесено отдельно, потому что зовут его из двух мест: со страницы
 * взаиморасчётов и из журнала счетов. Второй копии заводить нельзя — срок
 * жизни ссылки и текст письма разъехались бы, а понять, какая из двух
 * ссылок «правильная», по виду невозможно.
 *
 * Роль — кем мы приходимся этому контрагенту — часть ключа, по которому
 * ссылка находит свою строку отчёта. На взаиморасчётах она известна, из
 * журнала счетов нет; тогда её подбирает сервер, а не угадывает браузер.
 */
export interface ShareReportModalProps {
    open: boolean;
    counterpartyId: string;
    counterpartyName: string;
    /** Известна только там, где отчёт уже разложен по ролям. */
    ourRole?: string;
    onClose: () => void;
}

export default function ShareReportModal({
    open, counterpartyId, counterpartyName, ourRole, onClose,
}: ShareReportModalProps) {
    const { token } = theme.useToken();
    const [loading, setLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!open || !counterpartyId) return;
        let актуально = true;
        setShareUrl('');
        setEmail('');
        setLoading(true);
        api.post('/accounting/share-report', { counterpartyId, ourRole })
            .then((res) => { if (актуально) setShareUrl(res.data.shareUrl); })
            .catch(() => { if (актуально) toast.error('Не удалось создать ссылку'); })
            .finally(() => { if (актуально) setLoading(false); });
        return () => { актуально = false; };
    }, [open, counterpartyId, ourRole]);

    const copy = () => {
        navigator.clipboard.writeText(shareUrl);
        toast.success('Ссылка скопирована');
    };

    const send = async () => {
        if (!email) { toast.warning('Введите email'); return; }
        if (!shareUrl) { toast.warning('Ссылка ещё создаётся'); return; }
        setSending(true);
        try {
            await api.post('/accounting/send-report-email', { shareUrl, email });
            toast.success(`Отправлено на ${email}`);
            setEmail('');
        } catch {
            toast.error('Не удалось отправить');
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            title={<><ShareAltOutlined style={{ marginRight: 8 }} />Ссылка контрагенту — {counterpartyName}</>}
            open={open}
            onCancel={onClose}
            footer={null}
            width={560}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: 32 }}><Loader /></div>
            ) : shareUrl ? (
                <div>
                    {/* Что контрагент за ссылкой увидит — сказано прямо: её
                        шлют, чтобы он приложил бумаги, а не просто посмотрел. */}
                    <div style={{ fontSize: 12.5, color: token.colorTextSecondary, marginBottom: 14 }}>
                        По ссылке контрагент видит взаиморасчёты, может выставить счёт
                        и приложить к нему накладные и акт. Действует 7 дней.
                    </div>

                    <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                        Ссылка:
                    </Text>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                        <Input
                            value={shareUrl}
                            readOnly
                            prefix={<LinkOutlined style={{ color: token.colorTextDisabled }} />}
                            style={{ flex: 1, fontSize: 13 }}
                        />
                        <Button type="primary" icon={<CopyOutlined />} onClick={copy}>
                            Копировать
                        </Button>
                    </div>

                    <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                            Или отправить на email:
                        </Text>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Input
                                placeholder="email@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onPressEnter={send}
                                style={{ flex: 1 }}
                                type="email"
                            />
                            <Button icon={<SendOutlined />} onClick={send} loading={sending}>
                                Отправить
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <Empty description="Не удалось создать ссылку" />
            )}
        </Modal>
    );
}
