'use client';

import { useEffect, useMemo, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import styles from './TableColumnsButton.module.css';

export interface ColumnChoice {
    /** Ключ колонки таблицы — по нему и запоминается выбор. */
    key: string;
    title: string;
    /** Колонки, без которых строку не узнать: снять их нельзя. */
    locked?: boolean;
}

/**
 * Читаем выбор из браузера.
 *
 * Хранилище может быть недоступно — приватное окно, запрет на данные сайта,
 * — и тогда обращение к нему бросает. Молча возвращаем «показывать всё»:
 * потерянная настройка это неудобство, а упавший журнал — потерянный день.
 */
function readHidden(storageKey: string): Set<string> {
    try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []);
    } catch {
        return new Set();
    }
}

function writeHidden(storageKey: string, hidden: Set<string>) {
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(hidden)));
    } catch {
        // Не сохранилось — настройка проживёт до перезагрузки. Это терпимо.
    }
}

/**
 * Выбор видимых колонок журнала.
 *
 * Журнал широкий, а смотрят в него по-разному: логисту нужны машина и
 * водитель, бухгалтеру — номера и суммы. Раньше лишние колонки приходилось
 * пролистывать, каждый раз одни и те же.
 *
 * Выбор хранится в браузере, а не на сервере: это привычка рабочего места,
 * а не свойство компании — за одним столом сидят двое, и настройка одного
 * не должна менять экран другому.
 */
export function TableColumnsButton({
    storageKey,
    choices,
    hidden,
    onChange,
}: {
    storageKey: string;
    choices: ColumnChoice[];
    hidden: Set<string>;
    onChange: (hidden: Set<string>) => void;
}) {
    const [open, setOpen] = useState(false);

    // Первое чтение — после отрисовки: на сервере `localStorage` нет, и
    // обращение к нему при рендере уронило бы страницу целиком.
    useEffect(() => {
        onChange(readHidden(storageKey));
        // Читаем один раз на монтировании — дальше состоянием владеет журнал.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    const видно = useMemo(
        () => choices.filter((c) => c.locked || !hidden.has(c.key)).length,
        [choices, hidden],
    );

    const переключить = (key: string) => {
        const next = new Set(hidden);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        writeHidden(storageKey, next);
        onChange(next);
    };

    const вернуть = () => {
        const next = new Set<string>();
        writeHidden(storageKey, next);
        onChange(next);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={styles.trigger}>
                    <Columns3 className="h-4 w-4" />
                    Колонки
                    <span className={styles.count}>{видно} из {choices.length}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className={styles.panel}>
                <div className={styles.head}>
                    <span className={styles.title}>Что показывать</span>
                    <button
                        type="button"
                        className={styles.reset}
                        onClick={вернуть}
                        disabled={!hidden.size}
                    >
                        показать все
                    </button>
                </div>
                {choices.map((c) => (
                    <label key={c.key} className={`${styles.item} ${c.locked ? styles.locked : ''}`}>
                        <input
                            type="checkbox"
                            className={styles.box}
                            checked={c.locked || !hidden.has(c.key)}
                            disabled={c.locked}
                            onChange={() => переключить(c.key)}
                        />
                        <span>{c.title}</span>
                    </label>
                ))}
            </PopoverContent>
        </Popover>
    );
}
