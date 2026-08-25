/**
 * Текст обращения для телеграма.
 *
 * Главное требование владельца: сообщение должно быть таким, чтобы его можно
 * было скопировать целиком и переслать разработчику — без правки и без похода
 * в админку за подробностями. Поэтому здесь всё, что нужно для починки:
 * кто и из какой компании, что делал, чего ждал, что получил, какие заявки
 * задеты. И никакой разметки — текст пишет человек, любая звёздочка в нём
 * ломала бы разбор, и сообщение не дошло бы вовсе.
 */

import { KZ_UTC_OFFSET_MINUTES } from '../common/utils/business-date';

const CATEGORY_LABEL: Record<string, string> = {
    finance: 'Финансы',
    orders: 'Заявки',
    documents: 'Документы',
    display: 'Отображение',
    other: 'Другое',
};

const SEVERITY_LABEL: Record<string, string> = {
    low: 'низкая',
    medium: 'средняя',
    high: 'высокая',
};

/**
 * Дата глазами человека в Казахстане.
 *
 * Сервер живёт в UTC, и без сдвига вечернее событие уезжало бы во вчерашний
 * день. На обращениях это заметно при досыле старых: там дата — единственный
 * способ понять, о чём вообще речь и в каком порядке чинить. В карточке
 * компании — то же самое: «подана вчера» и «подана час назад» требуют разной
 * спешки.
 *
 * Общая на весь телеграм: время у владельца в переписке должно быть одно, а
 * не своё в каждом сообщении.
 */
export function formatKzDateTime(at: Date): string {
    const shifted = new Date(at.getTime() + KZ_UTC_OFFSET_MINUTES * 60 * 1000);
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(shifted.getUTCDate())}.${two(shifted.getUTCMonth() + 1)}.${shifted.getUTCFullYear()}`
        + ` ${two(shifted.getUTCHours())}:${two(shifted.getUTCMinutes())}`;
}

export interface SupportTicketMessageInput {
    id: string;
    title: string;
    category: string;
    severity: string;
    companyName: string;
    userName: string;
    userEmail?: string | null;
    createdAt?: Date | string | null;
    description: string;
    orders?: string[];
    details?: {
        process?: string;
        where?: string;
        expected?: string;
        actual?: string;
    } | null;
    /**
     * Обращение отправляется не в момент создания, а досылается из админки.
     * Без этой пометки старое обращение читается как «только что сломалось».
     */
    resent?: boolean;
}

export function buildSupportTicketMessage(t: SupportTicketMessageInput): string {
    const lines: string[] = [];

    // Срочность в первой строке: по ней решают, читать сейчас или потом.
    const severity = SEVERITY_LABEL[t.severity] || t.severity;
    const category = CATEGORY_LABEL[t.category] || t.category;
    lines.push(`Обращение с платформы · ${category} · срочность ${severity}`);
    if (t.resent) {
        lines.push('Досыл: обращение уже лежало в админке, смотрите дату.');
    }
    lines.push('');
    lines.push(t.title);
    lines.push('');
    if (t.createdAt) {
        lines.push(`Когда: ${formatKzDateTime(new Date(t.createdAt))}`);
    }
    lines.push(`Компания: ${t.companyName}`);
    lines.push(`Человек: ${t.userName}${t.userEmail ? ` (${t.userEmail})` : ''}`);

    if (t.orders?.length) {
        lines.push(`Заявки: ${t.orders.join(', ')}`);
    }

    lines.push('');
    lines.push('Что произошло:');
    lines.push(t.description);

    const d = t.details;
    if (d?.where) {
        lines.push('');
        lines.push(`Где: ${d.where}`);
    }
    if (d?.process) {
        lines.push('');
        lines.push('Что делал:');
        lines.push(d.process);
    }
    if (d?.expected) {
        lines.push('');
        lines.push('Чего ждал:');
        lines.push(d.expected);
    }
    if (d?.actual) {
        lines.push('');
        lines.push('Что получилось:');
        lines.push(d.actual);
    }

    lines.push('');
    lines.push(`Номер обращения: ${t.id}`);

    return lines.join('\n');
}
