'use client';

import { useRef, useState } from 'react';
import { Button, Dropdown, Modal, Tooltip, theme } from 'antd';
import { CheckCircleOutlined, DownOutlined, PaperClipOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/** То же, что принимает сервер: PDF и фотографии. */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp';

interface Props {
    contractId: string;
    contractNumber: string;
    fileName?: string | null;
    uploadedAt?: string | null;
    onChanged: () => void;
}

/**
 * Подписанный экземпляр договора (задачи шефа, G5).
 *
 * PDF из системы — это то, что отдают на подпись. Подписанный скан до сих
 * пор лежал где угодно, только не рядом с договором. Здесь его прикладывают
 * к договору; видят его обе стороны, новый файл заменяет прежний.
 */
export function SignedContractFile({ contractId, contractNumber, fileName, uploadedAt, onChanged }: Props) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const { token } = theme.useToken();

    const upload = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            setBusy(true);
            await api.post(`/contracts/${contractId}/signed-file`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success(fileName ? 'Подписанный договор заменён' : 'Подписанный договор приложен');
            onChanged();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось приложить файл');
        } finally {
            setBusy(false);
        }
    };

    const download = async () => {
        try {
            const res = await api.get(`/contracts/${contractId}/signed-file`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName || `Договор_${contractNumber}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Не удалось скачать подписанный договор');
        }
    };

    const remove = () => Modal.confirm({
        title: 'Убрать подписанный договор?',
        content: 'Файл пропадёт у обеих сторон. Сам договор, его текст и доп. соглашения останутся.',
        okText: 'Убрать',
        okButtonProps: { danger: true },
        cancelText: 'Отмена',
        onOk: async () => {
            try {
                await api.delete(`/contracts/${contractId}/signed-file`);
                toast.success('Подписанный договор убран');
                onChanged();
            } catch (e: any) {
                toast.error(e.response?.data?.message || 'Не удалось убрать файл');
            }
        },
    });

    return (
        // Кнопки стоят в заголовке раскрывашки — щелчок по ним не должен её сворачивать.
        <span onClick={(e) => e.stopPropagation()}>
            <input
                ref={input}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void upload(file);
                }}
            />
            {fileName ? (
                <Tooltip title={`${fileName}${uploadedAt ? ` · приложен ${dayjs(uploadedAt).format('DD.MM.YYYY')}` : ''}`}>
                    <Dropdown.Button
                        size="small"
                        icon={<DownOutlined />}
                        loading={busy}
                        onClick={download}
                        menu={{
                            items: [
                                { key: 'replace', label: 'Заменить файл', onClick: () => input.current?.click() },
                                { key: 'remove', label: 'Убрать файл', danger: true, onClick: remove },
                            ],
                        }}
                    >
                        <CheckCircleOutlined style={{ color: token.colorSuccess }} /> Подписанный
                    </Dropdown.Button>
                </Tooltip>
            ) : (
                <Button size="small" icon={<PaperClipOutlined />} loading={busy} onClick={() => input.current?.click()}>
                    Приложить подписанный
                </Button>
            )}
        </span>
    );
}
