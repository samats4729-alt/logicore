'use client';

import { useEffect, useState } from 'react';
import { Button, Empty, Input, Modal, Select, Typography, theme } from 'antd';
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
    /** Пусто — контрагента выбирают прямо здесь, из `counterparties`. */
    counterpartyId?: string;
    counterpartyName?: string;
    /** Известна только там, где отчёт уже разложен по ролям. */
    ourRole?: string;
    /**
     * Из кого выбирать, когда контрагент заранее не известен.
     *
     * Ссылку шлют как раз тогда, когда счёта ещё нет: перевозчик отработал
     * рейс и должен выставить свой счёт. Требовать, чтобы он уже был в
     * журнале, — значит выдавать ссылку только тем, кому она не нужна.
     */
    counterparties?: { id: string; name: string }[];
    onClose: () => void;
}

export default function ShareReportModal({
    open, counterpartyId, counterpartyName, ourRole, counterparties, onClose,
}: ShareReportModalProps) {
    const { token } = theme.useToken();
    const [loading, setLoading] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [выбранный, setВыбранный] = useState<string | undefined>();

    /** Кому выдаём: либо пришло снаружи, либо выбрали здесь. */
    const кому = counterpartyId || выбранный;
    const имя = counterpartyId
        ? counterpartyName
        : counterparties?.find((c) => c.id === выбранный)?.name;

    useEffect(() => {
        if (!open) setВыбранный(undefined);
    }, [open]);

    useEffect(() => {
        if (!open || !кому) return;
        let актуально = true;
        setShareUrl('');
        setEmail('');
        setLoading(true);
        api.post('/accounting/share-report', { counterpartyId: кому, ourRole })
            .then((res) => { if (актуально) setShareUrl(res.data.shareUrl); })
            .catch(() => { if (актуально) toast.error('Не удалось создать ссылку'); })
            .finally(() => { if (актуально) setLoading(false); });
        return () => { актуально = false; };
    }, [open, кому, ourRole]);

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
            title={(
                <>
                    <ShareAltOutlined style={{ marginRight: 8 }} />
                    Ссылка контрагенту{имя ? ` — ${имя}` : ''}
                </>
            )}
            open={open}
            onCancel={onClose}
            footer={null}
            width={560}
        >
            {/* Выбор контрагента — когда ссылку зовут не из его строки, а
                вообще: счёта от него ещё нет, и в журнале его не найти. */}
            {!counterpartyId && counterparties && (
                <div style={{ marginBottom: кому ? 18 : 0 }}>
                    <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
                        Кому отправляем
                    </div>
                    <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Выберите контрагента"
                        style={{ width: '100%' }}
                        value={выбранный}
                        onChange={setВыбранный}
                        options={counterparties.map((c) => ({ value: c.id, label: c.name }))}
                    />
                </div>
            )}

            {!кому ? null : loading ? (
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
