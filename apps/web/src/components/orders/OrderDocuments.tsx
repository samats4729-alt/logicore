'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Upload } from 'antd';
import {
    ChevronDown,
    ChevronUp,
    CircleAlert,
    Download,
    FileCheck2,
    FilePen,
    FileText,
    Inbox,
    Loader2,
    Plus,
    ReceiptText,
    Trash2,
    Upload as UploadIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
    accountingDocumentHref,
    deleteAccountingDocumentDraft,
    fetchAccountingDocuments,
    type AccountingDocumentListItem,
} from '@/lib/accounting-documents';
import styles from './order-documents.module.css';

/**
 * Все документы рейса одним списком.
 *
 * Раньше они лежали в трёх местах: накладные и сканы — на вкладке
 * «Документы», договор-заявка и доверенность — в блоке водителя на
 * «Деталях», счёт и акт — на «Финансах». Чтобы понять, что по рейсу выдано
 * и что подписано, приходилось обойти три экрана и ничего не забыть.
 *
 * Порядок списка — по ходу работы: сначала то, что выдают перевозчику и
 * водителю, потом бухгалтерские документы, потом приложенные файлы. Внутри
 * вида свежая версия сверху, прежние — под ней и приглушённые.
 */

type OrderDocKind = 'CONTRACT' | 'POWER_OF_ATTORNEY';

interface FormedDocument {
    id: string;
    kind: OrderDocKind;
    version: number;
    createdAt: string;
    isCurrent?: boolean;
    amount?: number;
    driverName?: string;
    author?: string;
}

interface OrderFile {
    id: string;
    type: string;
    fileName: string;
    fileSize: number;
    createdAt: string;
    uploadedById?: string;
    uploadedBy?: { firstName?: string; lastName?: string };
}

const KIND_TITLE: Record<OrderDocKind, string> = {
    CONTRACT: 'Договор-заявка',
    POWER_OF_ATTORNEY: 'Доверенность водителю',
};

const KIND_ICON: Record<OrderDocKind, LucideIcon> = {
    CONTRACT: FileText,
    POWER_OF_ATTORNEY: FilePen,
};

const FILE_TITLE: Record<string, string> = {
    TTN: 'Товарно-транспортная накладная',
    POWER_OF_ATTORNEY: 'Доверенность (файл)',
    ACT: 'Акт (файл)',
    INVOICE: 'Счёт (файл)',
    OTHER: 'Приложенный файл',
};

const ACC_TITLE: Record<string, string> = {
    PAYMENT_INVOICE: 'Счёт на оплату',
    SERVICE_ACT: 'Акт выполненных работ',
    RECONCILIATION_ACT: 'Акт сверки',
    CORRECTION: 'Корректировочный документ',
};

const ACC_STATUS: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'черновик', cls: styles.chipDraft },
    POSTED: { label: 'проведён', cls: styles.chipPosted },
    CANCELLED: { label: 'отменён', cls: styles.chipCancelled },
};

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₸`;
const when = (iso: string) => dayjs(iso).format('DD.MM.YYYY, HH:mm');

/** Размер файла. Мелкие не округляем в «0 КБ» — это читается как пустой файл. */
const fileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

export default function OrderDocuments({
    orderId,
    orderNumber,
    orderUpdatedAt,
    orderStatus,
    driverAssigned,
    hasCustomer,
    hasCarrier,
    currentUserId,
    isChief,
    onCreateAccounting,
}: {
    orderId: string;
    orderNumber?: string;
    /** Когда заявку правили в последний раз — для метки «документ отстал». */
    orderUpdatedAt?: string;
    /** Статус рейса: от него зависит, можно ли выдать акт. */
    orderStatus?: string;
    driverAssigned: boolean;
    hasCustomer: boolean;
    hasCarrier: boolean;
    currentUserId?: string;
    /** Руководитель компании: может удалять чужие файлы. */
    isChief: boolean;
    /** Открыть или создать счёт/акт — карточка умеет это сама. */
    onCreateAccounting?: (type: 'PAYMENT_INVOICE' | 'SERVICE_ACT') => void;
}) {
    const router = useRouter();

    const [formed, setFormed] = useState<Record<OrderDocKind, FormedDocument[]>>({
        CONTRACT: [],
        POWER_OF_ATTORNEY: [],
    });
    const [accounting, setAccounting] = useState<AccountingDocumentListItem[]>([]);
    const [files, setFiles] = useState<OrderFile[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const loadFormed = useCallback(async () => {
        const kinds: OrderDocKind[] = ['CONTRACT', 'POWER_OF_ATTORNEY'];
        const rows = await Promise.all(kinds.map(async (kind) => {
            try {
                const res = await api.get(`/orders/${orderId}/documents`, { params: { kind } });
                return [kind, (res.data || []) as FormedDocument[]] as const;
            } catch {
                return [kind, [] as FormedDocument[]] as const;
            }
        }));
        setFormed({
            CONTRACT: rows.find(([k]) => k === 'CONTRACT')?.[1] || [],
            POWER_OF_ATTORNEY: rows.find(([k]) => k === 'POWER_OF_ATTORNEY')?.[1] || [],
        });
    }, [orderId]);

    const loadAccounting = useCallback(async () => {
        try {
            const res = await fetchAccountingDocuments({ orderId, limit: 50 });
            setAccounting(res.data || []);
        } catch {
            setAccounting([]);
        }
    }, [orderId]);

    const loadFiles = useCallback(async () => {
        try {
            const res = await api.get(`/documents/order/${orderId}`);
            setFiles(res.data || []);
        } catch {
            setFiles([]);
        }
    }, [orderId]);

    const loadAll = useCallback(() => {
        loadFormed();
        loadAccounting();
        loadFiles();
    }, [loadFormed, loadAccounting, loadFiles]);

    useEffect(() => { loadAll(); }, [loadAll]);

    /**
     * Документ отстал от заявки.
     *
     * Печатная форма — снимок на момент выдачи, и правка заявки её не
     * меняет. Раньше об этом не говорилось нигде: у перевозчика оставалась
     * бумага со старой ставкой, и расходились уже на сверке.
     */
    const stale = useMemo(() => {
        if (!orderUpdatedAt) return null;
        const issued = [...formed.CONTRACT, ...formed.POWER_OF_ATTORNEY];
        if (!issued.length) return null;
        const newest = issued.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
        if (dayjs(orderUpdatedAt).isAfter(dayjs(newest.createdAt))) {
            return { changedAt: orderUpdatedAt, issuedAt: newest.createdAt };
        }
        return null;
    }, [orderUpdatedAt, formed]);

    const total = formed.CONTRACT.length + formed.POWER_OF_ATTORNEY.length
        + accounting.length + files.length;

    /**
     * Когда документ выдать нельзя — и почему.
     *
     * Причины не выдуманы: договор-заявка выписывается на перевозчика,
     * доверенность — на водителя, счёт нужен заказчик, а акт закрывает
     * оказанную услугу — сервер и не даст актировать незавершённый рейс.
     */
    const blockers = {
        cancelled: (s?: string) => (s === 'CANCELLED'
            ? 'Заявка отменена — документы по ней не выдаются.'
            : null),
    };

    const MAKERS: {
        id: string;
        label: string;
        primary?: boolean;
        blockedBy: (ctx: { status?: string; hasCustomer: boolean; hasCarrier: boolean; driverAssigned: boolean }) => string | null;
        run: () => void;
    }[] = [
        {
            id: 'CONTRACT',
            label: 'Договор-заявка',
            primary: true,
            blockedBy: (c) => blockers.cancelled(c.status)
                || (c.hasCarrier ? null : 'Сначала укажите перевозчика — договор-заявка выписывается на него.'),
            run: () => formDocument('CONTRACT'),
        },
        {
            id: 'POWER_OF_ATTORNEY',
            label: 'Доверенность',
            blockedBy: (c) => blockers.cancelled(c.status)
                || (c.driverAssigned ? null : 'Сначала назначьте водителя — доверенность выписывается на него.'),
            run: () => formDocument('POWER_OF_ATTORNEY'),
        },
        {
            id: 'PAYMENT_INVOICE',
            label: 'Счёт на оплату',
            blockedBy: (c) => blockers.cancelled(c.status)
                || (c.hasCustomer ? null : 'В заявке не указан заказчик — счёт выставлять некому.'),
            run: () => onCreateAccounting?.('PAYMENT_INVOICE'),
        },
        {
            id: 'SERVICE_ACT',
            label: 'Акт выполненных работ',
            blockedBy: (c) => blockers.cancelled(c.status)
                || (c.hasCustomer ? null : 'В заявке не указан заказчик — акт составлять не с кем.')
                || (c.status === 'COMPLETED' ? null : 'Акт выдаётся после завершения рейса: услуга ещё не оказана.'),
            run: () => onCreateAccounting?.('SERVICE_ACT'),
        },
    ];

    const formDocument = async (kind: OrderDocKind) => {
        if (kind === 'POWER_OF_ATTORNEY' && !driverAssigned) {
            toast.warning('Сначала назначьте водителя — доверенность выписывается на него');
            return;
        }
        try {
            setBusy(kind);
            const res = await api.post(`/orders/${orderId}/documents`, {}, { params: { kind } });
            toast.success(res.data.version > 1
                ? `${KIND_TITLE[kind]}: версия ${res.data.version}, прежняя сохранена`
                : `${KIND_TITLE[kind]} — готово`);
            await loadFormed();
        } catch (e: any) {
            toast.error(e.response?.data?.message || `Не удалось сформировать: ${KIND_TITLE[kind]}`);
        } finally {
            setBusy(null);
        }
    };

    const downloadFormed = async (row: FormedDocument, withStamp = false) => {
        try {
            const res = await api.get(`/orders/documents/${row.id}/pdf`, {
                params: withStamp ? { withStamp: 'true' } : undefined,
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${KIND_TITLE[row.kind]}_${orderNumber || orderId}_v${row.version}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось скачать документ');
        }
    };

    const downloadFile = async (row: OrderFile) => {
        try {
            const res = await api.get(`/documents/${row.id}/download`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = row.fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось скачать файл');
        }
    };

    const removeFile = (row: OrderFile) => {
        Modal.confirm({
            title: 'Удалить файл?',
            content: `${FILE_TITLE[row.type] || row.type} — ${row.fileName}. Восстановить не получится.`,
            okText: 'Удалить',
            okButtonProps: { danger: true },
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await api.delete(`/documents/${row.id}`);
                    toast.success('Файл удалён');
                    await loadFiles();
                } catch (e: any) {
                    toast.error(e.response?.data?.message || 'Не удалось удалить файл');
                }
            },
        });
    };

    const removeDraft = (row: AccountingDocumentListItem) => {
        Modal.confirm({
            title: 'Удалить черновик?',
            content: `${ACC_TITLE[row.type] || row.type} № ${row.number}. Проведённые документы так не удаляются.`,
            okText: 'Удалить',
            okButtonProps: { danger: true },
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await deleteAccountingDocumentDraft(row.id);
                    toast.success('Черновик удалён');
                    await loadAccounting();
                } catch (e: any) {
                    toast.error(e.response?.data?.message || 'Не удалось удалить черновик');
                }
            },
        });
    };

    const canRemoveFile = (row: OrderFile) => isChief || row.uploadedById === currentUserId;

    const uploadFile = async (options: any) => {
        const { file, onSuccess, onError } = options;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'TTN');
        try {
            setBusy('upload');
            await api.post(`/documents/upload/${orderId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Файл загружен');
            onSuccess?.('ok');
            await loadFiles();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось загрузить файл');
            onError?.(e);
        } finally {
            setBusy(null);
        }
    };

    const renderFormedGroup = (kind: OrderDocKind) => {
        const rows = formed[kind];
        if (!rows.length) return null;
        const Icon = KIND_ICON[kind];
        const [current, ...older] = rows;
        const open = expanded[kind];

        const line = (row: FormedDocument, isOld: boolean) => (
            <div key={row.id} className={`${styles.doc} ${isOld ? styles.docOld : ''}`}>
                <span className={styles.docIcon}><Icon size={16} /></span>
                <span className={styles.docMain}>
                    <span className={styles.docName}>
                        <b>{KIND_TITLE[kind]}</b>
                        <span className={`${styles.chip} ${styles.chipVersion}`}>версия {row.version}</span>
                        <span className={`${styles.chip} ${isOld ? styles.chipOld : styles.chipLive}`}>
                            {isOld ? 'изменён' : 'действующий'}
                        </span>
                    </span>
                    <span className={styles.docMeta}>
                        от {when(row.createdAt)}
                        {kind === 'CONTRACT' && row.amount != null && ` · ставка ${money(row.amount)}`}
                        {kind === 'POWER_OF_ATTORNEY' && row.driverName && ` · ${row.driverName}`}
                    </span>
                </span>
                <span className={styles.docActs}>
                    <button type="button" className={`${styles.act} ${styles.actSm}`} onClick={() => downloadFormed(row)}>
                        <Download size={13} /> Скачать
                    </button>
                    <button type="button" className={`${styles.act} ${styles.actSm}`} onClick={() => downloadFormed(row, true)}>
                        С печатью
                    </button>
                </span>
            </div>
        );

        return (
            <div className={styles.group} key={kind}>
                {line(current, false)}
                {open && older.map((row) => line(row, true))}
                {older.length > 0 && (
                    <button
                        type="button"
                        className={styles.more}
                        onClick={() => setExpanded((s) => ({ ...s, [kind]: !s[kind] }))}
                    >
                        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {open ? 'Скрыть прежние версии' : `Показать прежние версии (${older.length})`}
                        <span className={styles.moreHint}>
                            выданную версию удалить нельзя — она на руках у контрагента
                        </span>
                    </button>
                )}
            </div>
        );
    };

    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                <FileText size={14} />
                <h2 className={styles.cardTitle}>Документы заявки</h2>
                <span className={styles.cardCount}>{total}</span>
            </div>

            <div className={styles.cardBody}>
                {stale && (
                    <div className={styles.warn} role="note">
                        <CircleAlert size={14} />
                        <b>Заявка изменилась после выдачи документов.</b>
                        <span>
                            Правка {when(stale.changedAt)}, документ выдан {when(stale.issuedAt)}.
                            Печатная форма — снимок на момент выдачи и сама не обновляется.
                        </span>
                    </div>
                )}

                {/* Ряд одинаков всегда: недоступный документ не исчезает, а
                    гаснет и по нажатию объясняет причину. Исчезающая кнопка
                    заставляет гадать, есть такой документ у платформы или нет. */}
                <div className={styles.makeRow}>
                    {MAKERS.map((maker) => {
                        const block = maker.blockedBy({ status: orderStatus, hasCustomer, hasCarrier, driverAssigned });
                        const loading = busy === maker.id;
                        return (
                            <button
                                key={maker.id}
                                type="button"
                                aria-disabled={Boolean(block) || loading}
                                className={`${styles.act} ${maker.primary ? styles.actPrimary : ''} ${block ? styles.actOff : ''}`}
                                onClick={() => {
                                    if (block) { toast.warning(block); return; }
                                    if (loading) return;
                                    maker.run();
                                }}
                            >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                {maker.label}
                            </button>
                        );
                    })}
                    <Upload customRequest={uploadFile} showUploadList={false}>
                        <button type="button" className={styles.act} disabled={busy === 'upload'}>
                            {busy === 'upload' ? <Loader2 size={14} className="animate-spin" /> : <UploadIcon size={14} />}
                            Загрузить файл
                        </button>
                    </Upload>
                </div>

                {renderFormedGroup('CONTRACT')}
                {renderFormedGroup('POWER_OF_ATTORNEY')}

                {accounting.length > 0 && (
                    <div className={styles.group}>
                        {accounting.map((row) => {
                            const status = ACC_STATUS[row.status] || { label: row.status, cls: styles.chipOld };
                            const Icon = row.type === 'SERVICE_ACT' ? FileCheck2 : ReceiptText;
                            return (
                                <div key={row.id} className={styles.doc}>
                                    <span className={styles.docIcon}><Icon size={16} /></span>
                                    <span className={styles.docMain}>
                                        <span className={styles.docName}>
                                            <b>{ACC_TITLE[row.type] || row.type} № {row.number}</b>
                                            <span className={`${styles.chip} ${status.cls}`}>{status.label}</span>
                                        </span>
                                        <span className={styles.docMeta}>
                                            от {dayjs(row.documentDate).format('DD.MM.YYYY')} · {money(row.total)}
                                            {row.amountPaid > 0 && ` · оплачено ${money(row.amountPaid)}`}
                                        </span>
                                    </span>
                                    <span className={styles.docActs}>
                                        <button
                                            type="button"
                                            className={`${styles.act} ${styles.actSm}`}
                                            onClick={() => router.push(accountingDocumentHref({ id: row.id, type: row.type as any }))}
                                        >
                                            Открыть
                                        </button>
                                        {row.status === 'DRAFT' && (
                                            <button
                                                type="button"
                                                className={`${styles.act} ${styles.actSm} ${styles.actDanger}`}
                                                onClick={() => removeDraft(row)}
                                            >
                                                <Trash2 size={13} /> Удалить
                                            </button>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {files.length > 0 && (
                    <div className={styles.group}>
                        {files.map((row) => (
                            <div key={row.id} className={styles.doc}>
                                <span className={styles.docIcon}><Inbox size={16} /></span>
                                {/* Главное — имя файла: вид документа один на все
                                    вложения, и по нему скан от накладной не
                                    отличить. Вид уходит в метку рядом. */}
                                <span className={styles.docMain}>
                                    <span className={styles.docName}>
                                        <b>{row.fileName}</b>
                                        <span className={`${styles.chip} ${styles.chipOld}`}>
                                            {FILE_TITLE[row.type] || 'файл'}
                                        </span>
                                    </span>
                                    <span className={styles.docMeta}>
                                        {when(row.createdAt)}
                                        {row.uploadedBy && ` · ${row.uploadedBy.lastName || ''} ${row.uploadedBy.firstName || ''}`.trimEnd()}
                                        {fileSize(row.fileSize) && ` · ${fileSize(row.fileSize)}`}
                                    </span>
                                </span>
                                <span className={styles.docActs}>
                                    <button type="button" className={`${styles.act} ${styles.actSm}`} onClick={() => downloadFile(row)}>
                                        <Download size={13} /> Скачать
                                    </button>
                                    {canRemoveFile(row) && (
                                        <button
                                            type="button"
                                            className={`${styles.act} ${styles.actSm} ${styles.actDanger}`}
                                            onClick={() => removeFile(row)}
                                        >
                                            <Trash2 size={13} /> Удалить
                                        </button>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {total === 0 && (
                    <div className={styles.empty}>
                        По этому рейсу документов пока нет. Начните с договора-заявки — его ждёт перевозчик.
                    </div>
                )}
            </div>
        </section>
    );
}
