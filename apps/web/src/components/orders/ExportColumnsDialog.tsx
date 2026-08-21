'use client';

import { useMemo, useState } from 'react';
import { Loader2, FileSpreadsheet } from 'lucide-react';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEFAULT_REF_LABEL } from './TransportNumbers';
import styles from './export-columns-dialog.module.css';

/**
 * Колонки выгрузки. Тот же список и в том же порядке, что на сервере
 * (`orders-export.service.ts`): по нему собирается лист, по нему же здесь
 * рисуются галочки.
 *
 * Разложены по смыслу, а не сплошным столбцом из двадцати четырёх строк:
 * бухгалтер ищет «суммы» и «даты», а не двадцать четвёртый пункт списка.
 */
const GROUPS: { title: string; columns: string[] }[] = [
    {
        title: 'Рейс',
        columns: [
            '№ заявки', 'Номер ТТН', DEFAULT_REF_LABEL,
            'Статус', 'Груз', 'Вес, кг', 'Откуда', 'Куда',
        ],
    },
    {
        title: 'Даты',
        columns: ['Дата создания', 'Дата погрузки', 'Дата завершения'],
    },
    {
        title: 'Кто везёт',
        columns: ['Заказчик', 'Перевозчик', 'Водитель', 'Транспорт', 'Менеджер'],
    },
    {
        title: 'Деньги',
        columns: [
            'Ставка заказчика', 'Оплачено заказчиком', 'Долг заказчика',
            'Ставка перевозчика', 'Оплачено перевозчику', 'Долг перевозчику',
            'Маржа', 'Счёт', 'Срок оплаты заказчиком', 'Срок оплаты перевозчику',
        ],
    },
];

const ALL = GROUPS.flatMap((group) => group.columns);

/** С чего начинать: то, ради чего выгрузку и просили. */
const DEFAULT_ON = new Set(ALL);

/**
 * Выбор колонок перед выгрузкой в Excel.
 *
 * Раньше уходили все двадцать четыре, и бухгалтер прятала лишние руками —
 * каждый раз заново. Теперь отмечает нужные, и файл приходит готовым.
 *
 * Заодно это способ не отдать лишнего: собрала номера, даты и суммы
 * заказчика — и отправила директору, не вычищая маржу.
 */
export function ExportColumnsDialog({
    open, onOpenChange, count, exporting, onExport,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Сколько заявок уйдёт в файл — это отобранное на экране. */
    count: number;
    exporting: boolean;
    onExport: (columns: string[]) => void;
}) {
    const [picked, setPicked] = useState<Set<string>>(new Set(DEFAULT_ON));

    const chosen = useMemo(() => ALL.filter((name) => picked.has(name)), [picked]);

    const toggle = (name: string) => {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleGroup = (columns: string[], on: boolean) => {
        setPicked((prev) => {
            const next = new Set(prev);
            for (const name of columns) {
                if (on) next.add(name);
                else next.delete(name);
            }
            return next;
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={styles.panel}>
                <DialogHeader>
                    <DialogTitle>Что выгрузить в Excel</DialogTitle>
                    <DialogDescription>
                        Заявок в файле: {count}. Отметьте колонки — лишние в файл не попадут.
                    </DialogDescription>
                </DialogHeader>

                <div className={styles.groups}>
                    {GROUPS.map((group) => {
                        const allOn = group.columns.every((name) => picked.has(name));
                        return (
                            <section key={group.title} className={styles.group}>
                                <header className={styles.groupHead}>
                                    <span className={styles.groupTitle}>{group.title}</span>
                                    <button
                                        type="button"
                                        className={styles.groupToggle}
                                        onClick={() => toggleGroup(group.columns, !allOn)}
                                    >
                                        {allOn ? 'снять все' : 'выбрать все'}
                                    </button>
                                </header>
                                <div className={styles.items}>
                                    {group.columns.map((name) => (
                                        <label key={name} className={styles.item}>
                                            <input
                                                type="checkbox"
                                                className={styles.box}
                                                checked={picked.has(name)}
                                                onChange={() => toggle(name)}
                                            />
                                            <span>{name}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>

                <DialogFooter className={styles.footer}>
                    <span className={cn(styles.summary, !chosen.length && styles.summaryEmpty)}>
                        {chosen.length
                            ? `Колонок в файле: ${chosen.length} из ${ALL.length}`
                            : 'Отметьте хотя бы одну колонку'}
                    </span>
                    <div className={styles.actions}>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Отмена
                        </Button>
                        <Button
                            disabled={!chosen.length || exporting}
                            onClick={() => onExport(chosen)}
                        >
                            {exporting
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <FileSpreadsheet className="h-4 w-4" />}
                            Выгрузить
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
