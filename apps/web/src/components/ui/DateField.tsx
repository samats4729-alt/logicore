'use client';

import { useEffect, useRef } from 'react';
import { DatePicker } from 'antd';
import type { DatePickerProps, GetProps } from 'antd';
import dayjs from 'dayjs';
import {
    ПОДСКАЗКА_ДАТЫ,
    ПОДСКАЗКА_МЕСЯЦА,
    ФОРМАТ_ДАТЫ,
    ФОРМАТ_МЕСЯЦА,
    разобратьДату,
} from '@/lib/ru-date';

/**
 * Поле даты: набирается руками, календарь — на выбор, а не обязанность.
 *
 * Дату в накладной, счёте или договоре человек уже знает: он смотрит на
 * бумагу и печатает «20.05.2026». Заставлять его вместо этого листать
 * календарь на четырнадцать месяцев назад — работа на ровном месте, и
 * именно на неё жаловался владелец.
 *
 * Три вещи, которых поле лишено, если ставить `DatePicker` как есть.
 *
 * Первое — про это никто не знает. Пустое поле подписано «Выберите дату»,
 * и подпись прямо говорит: только мышью. Здесь стоит «ДД.ММ.ГГГГ» — видно
 * и что можно печатать, и в каком порядке идут числа.
 *
 * Второе — набранное надо подтвердить. Antd ставит дату по Enter или
 * когда из поля уходят; до тех пор в форме пусто. Человек печатает,
 * видит дату в поле, жмёт «Сохранить» — и получает «укажите дату».
 * Поэтому дата встаёт сама, как только её дописали до конца.
 *
 * Третье — формат. Без явного `format` antd ждёт «2026-05-20», и точки
 * не понимает вовсе.
 */

const { RangePicker } = DatePicker;

type RangeProps = GetProps<typeof RangePicker>;

export type DateFieldProps = DatePickerProps;

/** Одна дата. */
export function DateField({
    format = ФОРМАТ_ДАТЫ,
    placeholder = ПОДСКАЗКА_ДАТЫ,
    onChange,
    ...props
}: DateFieldProps) {
    const ссылка = useRef<any>(null);

    // Свежий обработчик — в ссылке, чтобы подписка ниже не пересоздавалась
    // на каждый ререндер формы: поле ввода живёт столько же, сколько сам
    // пикер, и переподписка на него была бы работой на каждое нажатие.
    const свежий = useRef(onChange);
    свежий.current = onChange;

    /**
     * У поля есть ещё и время — тогда на лету не подставляем.
     *
     * «20.05.2026 14:30» набирается через промежуточное «20.05.2026», а
     * это уже законченная дата: подставь её сразу — и поле перепишет себя
     * на «20.05.2026 00:00» ровно в тот момент, когда человек собрался
     * набрать часы. Такое поле у нас одно, дата погрузки.
     */
    const соВременем = Boolean((props as { showTime?: unknown }).showTime)
        || (typeof format === 'string' && /[HhmsAa]/.test(format));

    /**
     * Поставить дату, как только её дописали.
     *
     * Слушаем само поле ввода, а не `onChange` пикера: тот срабатывает
     * уже после подтверждения — то есть после того, чего мы и хотим
     * избежать.
     */
    useEffect(() => {
        if (соВременем) return;
        const поле: HTMLInputElement | null | undefined =
            ссылка.current?.nativeElement?.querySelector('input');
        if (!поле) return;

        const слушать = () => {
            const дата = разобратьДату(поле.value);
            if (дата) свежий.current?.(дата, дата.format(ФОРМАТ_ДАТЫ));
        };

        поле.addEventListener('input', слушать);
        return () => поле.removeEventListener('input', слушать);
    }, [соВременем]);

    return (
        <DatePicker
            ref={ссылка}
            format={format}
            placeholder={placeholder}
            onChange={onChange}
            {...props}
        />
    );
}

export interface DateStringFieldProps
    extends Omit<DatePickerProps, 'value' | 'onChange' | 'defaultValue'> {
    /** Дата строкой «2026-05-20» — как её хранит форма и ждёт сервер. */
    value?: string | null;
    onChange?: (value: string) => void;
}

/**
 * То же поле, но снаружи — строка «2026-05-20».
 *
 * Часть экранов держит дату строкой и такой же строкой отправляет её на
 * сервер. Раньше там стояло обычное браузерное поле `type="date"`, и с ним
 * две беды: формат в нём задаёт не приложение, а браузер (в английском он
 * покажет «mm/dd/yyyy» и наш «20.05.2026» примет как мусор), и выглядит
 * оно не так, как соседние поля дат.
 *
 * Здесь тот же вид и тот же ввод, что везде, а наружу по-прежнему уходит
 * строка — состояние экранов и формат обмена с сервером не трогаем.
 */
export function DateStringField({ value, onChange, ...props }: DateStringFieldProps) {
    return (
        <DateField
            value={value ? dayjs(value) : null}
            onChange={(дата) => onChange?.(дата ? дата.format('YYYY-MM-DD') : '')}
            {...props}
        />
    );
}

export type DateRangeFieldProps = RangeProps;

/**
 * Период «с — по».
 *
 * Здесь дату не ставим на лету намеренно: пока набрано только начало,
 * периода ещё нет, и подставлять половину не во что. Antd сам переводит
 * курсор во второе поле, когда первое дописано, а по Enter или уходу из
 * поля ставит период целиком — этого достаточно.
 */
export function DateRangeField({
    format = ФОРМАТ_ДАТЫ,
    placeholder = [ПОДСКАЗКА_ДАТЫ, ПОДСКАЗКА_ДАТЫ],
    ...props
}: DateRangeFieldProps) {
    return <RangePicker format={format} placeholder={placeholder} {...props} />;
}

/** Период по месяцам: «05.2026 — 09.2026». */
export function MonthRangeField({
    format = ФОРМАТ_МЕСЯЦА,
    placeholder = [ПОДСКАЗКА_МЕСЯЦА, ПОДСКАЗКА_МЕСЯЦА],
    ...props
}: DateRangeFieldProps) {
    return <RangePicker picker="month" format={format} placeholder={placeholder} {...props} />;
}
