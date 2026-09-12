'use client';

import { Info, RotateCcw, TriangleAlert } from 'lucide-react';
import styles from './requisites-fields.module.css';

/**
 * Реквизиты сторон в редакторе договора.
 *
 * Блок не хранит значения — он хранит отличия от карточек. Чего в
 * `overrides` нет, то берётся из карточки в момент печати: поправили банк
 * в карточке — все договоры, где его не переписывали руками, подтянут
 * новый сами. До этого текст снимался с карточек один раз, и в заведённых
 * договорах навсегда оставался прежний счёт.
 *
 * Пустые поля показываются пустыми клетками. В свободном тексте пустое
 * поле просто исчезало, и строки сторон разъезжались — сверить колонки
 * было нельзя.
 */

/** Значения из карточек компаний: строка на поле. */
export interface СтрокаРеквизитов {
    key: string;
    label: string;
    left: string;
    right: string;
}

/** Что в этом договоре отличается от карточек. */
export type ПравкиРеквизитов = Record<string, { left?: string | null; right?: string | null }>;

export interface RequisitesFieldsProps {
    /** Из карточек. Пока не загрузились — пустой список. */
    fields: СтрокаРеквизитов[];
    overrides: ПравкиРеквизитов;
    onChange: (правки: ПравкиРеквизитов) => void;
    /** Перейти к свободному тексту — для нестандартных реквизитов. */
    onSwitchToText: () => void;
}

/** Сторона договора: слева экспедитор, справа заказчик. */
type Сторона = 'left' | 'right';

export default function RequisitesFields({
    fields, overrides, onChange, onSwitchToText,
}: RequisitesFieldsProps) {
    // Ключ есть — печатается вписанное, даже если это пусто: иначе стереть
    // лишний телефон в одном договоре было бы нельзя, пустое значение тут же
    // подменялось бы карточкой. Ровно так же это читает и печать.
    const значение = (строка: СтрокаРеквизитов, сторона: Сторона) => {
        const своё = overrides[строка.key]?.[сторона];
        return своё !== undefined ? (своё ?? '') : строка[сторона];
    };

    const своё = (строка: СтрокаРеквизитов, сторона: Сторона) =>
        overrides[строка.key]?.[сторона] !== undefined;

    const записать = (строка: СтрокаРеквизитов, сторона: Сторона, текст: string) => {
        const было = overrides[строка.key] || {};
        // Вернул ровно то, что в карточке, — это не правка, а возврат:
        // помечать такую клетку «своим» значило бы врать.
        if (текст === строка[сторона]) {
            const стало = { ...было };
            delete стало[сторона];
            const правки = { ...overrides };
            if (Object.keys(стало).length) правки[строка.key] = стало;
            else delete правки[строка.key];
            onChange(правки);
            return;
        }
        onChange({ ...overrides, [строка.key]: { ...было, [сторона]: текст } });
    };

    const вернуть = (строка: СтрокаРеквизитов, сторона: Сторона) => {
        const стало = { ...(overrides[строка.key] || {}) };
        delete стало[сторона];
        const правки = { ...overrides };
        if (Object.keys(стало).length) правки[строка.key] = стало;
        else delete правки[строка.key];
        onChange(правки);
    };

    /**
     * Чего не хватает: поля, пустые и в карточке, и в правках.
     *
     * Считаем обе стороны. Пустая строка в своей половине договора — такая
     * же дыра, как у контрагента, и увидеть её надо до того, как договор
     * ушёл на подпись, а не в готовом PDF.
     */
    const нехватка = (сторона: Сторона) => fields
        .filter(строка => !значение(строка, сторона))
        .map(строка => строка.label.toLowerCase());

    const нетСлева = нехватка('left');
    const нетСправа = нехватка('right');

    const клетка = (строка: СтрокаРеквизитов, сторона: Сторона) => {
        const этоСвоё = своё(строка, сторона);
        return (
            <td className={этоСвоё ? styles.own : undefined}>
                <div className={styles.cell}>
                    <input
                        className={styles.input}
                        value={значение(строка, сторона)}
                        onChange={(e) => записать(строка, сторона, e.target.value)}
                        placeholder={строка[сторона] ? '' : 'не заполнено в карточке'}
                        aria-label={`${строка.label} — ${сторона === 'left' ? 'экспедитор' : 'заказчик'}`}
                    />
                    {этоСвоё && (
                        <>
                            <span className={styles.mark}>своё</span>
                            <button
                                type="button"
                                className={styles.revert}
                                onClick={() => вернуть(строка, сторона)}
                                title="Вернуть значение из карточки"
                                aria-label={`Вернуть «${строка.label}» из карточки`}
                            >
                                <RotateCcw size={13} />
                            </button>
                        </>
                    )}
                </div>
            </td>
        );
    };

    return (
        <div className={styles.wrap}>
            <div className={styles.hint}>
                <Info size={15} className={styles.hintIcon} />
                <span>
                    Значения берутся из карточек компаний.{' '}
                    <b>Поправите карточку — договор подтянет новое сам.</b>{' '}
                    Что измените здесь, останется только в этом договоре.
                </span>
            </div>

            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.colLabel} />
                        <th>Экспедитор</th>
                        <th>Заказчик</th>
                    </tr>
                </thead>
                <tbody>
                    {fields.map(строка => (
                        <tr key={строка.key}>
                            <td className={`${styles.colLabel} ${styles.label}`}>{строка.label}</td>
                            {клетка(строка, 'left')}
                            {клетка(строка, 'right')}
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className={styles.foot}>
                <div className={styles.missingList}>
                    {нетСлева.length > 0 && (
                        <span className={styles.missing}>
                            <TriangleAlert size={13} />
                            У вашей организации не заполнено: {нетСлева.join(', ')}
                        </span>
                    )}
                    {нетСправа.length > 0 && (
                        <span className={styles.missing}>
                            <TriangleAlert size={13} />
                            У заказчика не заполнено: {нетСправа.join(', ')}
                        </span>
                    )}
                </div>
                <button type="button" className={styles.textLink} onClick={onSwitchToText}>
                    Вписать свободным текстом
                </button>
            </div>
        </div>
    );
}
