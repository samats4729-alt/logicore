'use client';

import { InputNumber } from 'antd';
import type { InputNumberProps } from 'antd';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-format';

type MoneyInputProps = Omit<InputNumberProps<string | number>, 'formatter' | 'parser' | 'decimalSeparator'>;

/**
 * Поле для суммы.
 *
 * Разряды разбиваются пробелом на лету, тиын дописываются, когда из поля
 * уходят: пока набирают «5000000», дописывать «,00» после каждой цифры
 * значит мешать. Запятая — разделитель дробной части, как в накладной, а
 * не точка.
 */
export function MoneyInput({ min = 0, placeholder = '0', style, ...props }: MoneyInputProps) {
    return (
        <InputNumber
            min={min}
            placeholder={placeholder}
            style={{ width: '100%', ...style }}
            precision={2}
            decimalSeparator=","
            /**
             * Пока набирают — показываем как есть, только разрядами. Как
             * только из поля ушли — дописываем тиын.
             *
             * Своё `precision` antd на показ не применяет, если задан свой
             * `formatter`: копейки пришлось бы дописывать самим на каждую
             * цифру, а «5,00» после первой же нажатой клавиши мешает
             * набирать. Флаг `userTyping` и отделяет одно от другого.
             */
            formatter={(value, info) => {
                if (value === '' || value === null || value === undefined) return '';
                if (info?.userTyping) return formatMoneyInput(value);
                const число = Number(parseMoneyInput(String(value)));
                return formatMoneyInput(Number.isFinite(число) ? число.toFixed(2) : value);
            }}
            parser={(value) => parseMoneyInput(value) as unknown as string}
            {...props}
        />
    );
}
