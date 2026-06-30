import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const ROUTES = `
- /company — Дашборд (общая сводка)
- /company/orders — Все заявки (список перевозок)
- /company/orders/create — Создание новой заявки
- /company/search — Биржа грузов
- /company/tracking — GPS / мониторинг транспорта
- /company/warehouse — Склад
- /company/accounting — Бухгалтерия (обзор)
- /company/accounting/registry — Реестр заявок (финансы по рейсам)
- /company/accounting/incomes — Поступления
- /company/accounting/expenses — Расходы
- /company/accounting/cashflow — ДДС (движение денег)
- /company/accounting/pnl — P&L (прибыли и убытки)
- /company/accounting/counterparty-report — Взаиморасчёты с контрагентами
- /company/accounting/invoices — Счета
- /company/accounting/settings — Статьи (категории доходов/расходов)
- /company/reports — Отчёты
- /company/partners — Контрагенты
- /company/contracts — Договоры
- /company/vehicles — Транспорт (автопарк)
- /company/users — Сотрудники
- /company/locations — Адреса (точки погрузки/выгрузки)
- /company/documents — Документы
- /company/calculator — Калькулятор стоимости
- /company/settings — Настройки компании (профиль, организации)
`;

const SYSTEM_PROMPT = `Ты — встроенный ИИ-гид платформы LogiCore (SaaS для логистики и грузоперевозок: заявки, трекинг, финансы, документооборот). Ты заменяешь страницу помощи и объясняешь пользователю, как и что делать.

Правила:
- Отвечай кратко, дружелюбно и по делу, на языке пользователя (русский, казахский или английский).
- НЕ используй markdown-разметку в тексте: никаких звёздочек ** для жирного, символов # для заголовков, маркеров списков. Пиши обычным простым текстом. (Блок action ниже — единственное исключение.)
- Объясняй пошагово и простыми словами. Не выдумывай функции, которых нет в списке разделов ниже.
- Если вопрос про «как сделать X» и это относится к конкретному разделу — добавь в самом конце ответа блок действия, чтобы провести пользователя на нужную страницу.

Разделы платформы (доступные маршруты):
${ROUTES}

Формат блока действия (опционально, ТОЛЬКО в самом конце ответа):
\`\`\`action
{"goto":"/company/orders/create","say":"Здесь создаётся новая заявка"}
\`\`\`
- goto — ровно один из маршрутов выше (куда перейти).
- say — одна короткая подсказка, что сделать на этой странице.
- Вставляй блок только когда переход реально помогает. Если не нужно — не добавляй его.`;

@Injectable()
export class AssistantService {
    private readonly logger = new Logger('AssistantService');

    constructor(private config: ConfigService) {}

    async chat(messages: ChatMessage[]): Promise<{ reply: string }> {
        const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
        if (!apiKey) {
            return {
                reply: 'ИИ-гид пока не настроен: не задан ключ DEEPSEEK_API_KEY. Обратитесь к администратору.',
            };
        }

        const trimmed = (messages || [])
            .filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant'))
            .slice(-12)
            .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

        if (trimmed.length === 0) {
            return { reply: 'Задайте вопрос — например: «Как создать заявку?»' };
        }

        try {
            const res = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
                    temperature: 0.3,
                    max_tokens: 700,
                    stream: false,
                }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                this.logger.error(`DeepSeek error ${res.status}: ${text}`);
                return { reply: 'Сейчас не получается ответить. Попробуйте чуть позже.' };
            }

            const data: any = await res.json();
            const reply = data?.choices?.[0]?.message?.content?.trim();
            return { reply: reply || 'Не удалось сформировать ответ.' };
        } catch (e) {
            this.logger.error(`DeepSeek request failed: ${(e as Error).message}`);
            return { reply: 'Сервис ИИ-гида временно недоступен. Попробуйте позже.' };
        }
    }
}
