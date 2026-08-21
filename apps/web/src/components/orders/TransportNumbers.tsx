'use client';

import { useState } from 'react';
import { Form, Input, Modal } from 'antd';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import styles from './TransportNumbers.module.css';

/**
 * Как называется графа, пока заказчик не назвал её по-своему.
 *
 * «ID» — то слово, которым этот номер зовут в большинстве компаний, откуда
 * к нам приходят заявки. Прежнее «Номер у заказчика» было честным, но
 * длинным и незнакомым: в колонке журнала оно обрезалось, а в счёте
 * заказчик искал глазами своё привычное слово и не находил.
 *
 * Название остаётся настройкой — переименовать графу можно тут же, в
 * заявке. Здесь только то, с чего начинают.
 */
export const DEFAULT_REF_LABEL = 'ID';

interface TransportNumbersProps {
    /** Номер накладной, уже введённый в форме — для свёрнутой строки. */
    ttnNumber?: string | null;
    /** Номер этого рейса у заказчика, уже введённый в форме. */
    refNumber?: string | null;
    /** Как этот заказчик называет свой номер. Пусто — общее название. */
    refLabel?: string | null;
    /** Заказчик из справочника: только ему можно переименовать графу. */
    counterpartyId?: string | null;
    canRename?: boolean;
    /** Переименовали — родитель обновляет у себя список контрагентов. */
    onRenamed?: (label: string) => void;
    disabled?: boolean;
}

/**
 * Два номера рейса: накладная и номер этого же рейса в системе заказчика.
 *
 * Раньше вторая графа появлялась в заявке, только если кто-то заранее
 * заходил в карточку контрагента и вписывал там её название. Об этом надо
 * было догадаться: бухгалтер приходила на платформу, графы не находила, и
 * номер до счёта не доезжал. Теперь графа есть всегда и работает с общим
 * названием, а переименовать её можно здесь же — заходить никуда не нужно.
 */
export function TransportNumbers({
    ttnNumber,
    refNumber,
    refLabel,
    counterpartyId,
    canRename = false,
    onRenamed,
    disabled = false,
}: TransportNumbersProps) {
    const [open, setOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [draftLabel, setDraftLabel] = useState('');
    const [saving, setSaving] = useState(false);

    const подпись = refLabel?.trim() || DEFAULT_REF_LABEL;

    const заполнено = [
        ttnNumber?.trim() ? `ТТН ${ttnNumber.trim()}` : null,
        refNumber?.trim() ? `${подпись} ${refNumber.trim()}` : null,
    ].filter(Boolean).join(' · ');

    const переименовать = async () => {
        const название = draftLabel.trim();
        if (!название) { toast.error('Впишите название графы'); return; }
        if (!counterpartyId) return;
        setSaving(true);
        try {
            await api.patch(`/external-companies/${counterpartyId}`, { customerRefLabel: название });
            onRenamed?.(название);
            setRenaming(false);
            toast.success(`Графа названа «${название}» — так она будет называться во всех заявках этого заказчика`);
        } catch {
            toast.error('Не удалось переименовать графу');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.root}>
            <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)}>
                <span className={styles.chev}>{open ? '−' : '+'}</span>
                Номера перевозки
                {!open && (заполнено
                    ? <span className={styles.values}>{заполнено}</span>
                    : <span className={styles.sub}>ТТН, номер у заказчика</span>
                )}
            </button>

            {open && (
                <div className={styles.fields}>
                    <div>
                        <div className={styles.label}>Номер ТТН</div>
                        <Form.Item name="ttnNumber" noStyle>
                            <Input placeholder="Номер накладной" disabled={disabled} />
                        </Form.Item>
                    </div>
                    <div>
                        <div className={styles.label}>
                            {подпись}
                            {canRename && !disabled && (
                                <button
                                    type="button"
                                    className={styles.rename}
                                    onClick={() => { setDraftLabel(refLabel?.trim() || ''); setRenaming(true); }}
                                >
                                    переименовать
                                </button>
                            )}
                        </div>
                        <Form.Item name="customerRefNumber" noStyle>
                            <Input placeholder={`${подпись} у заказчика`} disabled={disabled} />
                        </Form.Item>
                    </div>
                </div>
            )}

            <Modal
                open={renaming}
                title="Как заказчик называет свой номер"
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={saving}
                onOk={переименовать}
                onCancel={() => setRenaming(false)}
                destroyOnClose
            >
                <p style={{ color: 'var(--nova-fg-2)', fontSize: 13, marginTop: 0 }}>
                    У одного заказчика это «ID», у другого «Номер ТТН». Название запомнится
                    за этим контрагентом и будет стоять во всех его заявках.
                </p>
                <Input
                    autoFocus
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    onPressEnter={переименовать}
                    placeholder="Например: ID, Номер заказа"
                    maxLength={40}
                />
            </Modal>
        </div>
    );
}
