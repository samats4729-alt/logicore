import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const ROUTES = `
- /company — Дашборд (общая сводка)
- /company/orders — Все заявки
- /company/orders/create — Создание заявки
- /company/search — Биржа грузов
- /company/tracking — GPS / мониторинг
- /company/warehouse — Склад
- /company/accounting — Бухгалтерия (обзор)
- /company/accounting/registry — Реестр заявок
- /company/accounting/incomes — Поступления
- /company/accounting/expenses — Расходы
- /company/accounting/cashflow — ДДС
- /company/accounting/pnl — P&L
- /company/accounting/counterparty-report — Взаиморасчёты
- /company/accounting/invoices — Счета
- /company/partners — Контрагенты
- /company/contracts — Договоры
- /company/vehicles — Транспорт
- /company/users — Сотрудники
- /company/locations — Адреса
- /company/calculator — Калькулятор
- /company/settings — Настройки компании
`;

const SELECTORS = `
Меню (верхний уровень, видно всегда):
- Меню «Заявки»: [data-menu-id$='-orders_group']
- Меню «Логистика»: [data-menu-id$='-logistics_group']
- Меню «Финансы»: [data-menu-id$='-finance_group']
- Меню «Компания»: [data-menu-id$='-company_group']
- Дашборд: [data-menu-id$='-/company']
- Калькулятор: [data-menu-id$='-/company/calculator']
- Настройки: [data-menu-id$='-/company/settings']

Подпункты (видны ТОЛЬКО после открытия их родительского меню):
- Все заявки (в «Заявки»): [data-menu-id$='-/company/orders']
- Биржа грузов (в «Заявки»): [data-menu-id$='-/company/search']
- Бухгалтерия (в «Финансы»): [data-menu-id$='-/company/accounting']
- Реестр заявок (в «Финансы»): [data-menu-id$='-/company/accounting/registry']
- Поступления (в «Финансы»): [data-menu-id$='-/company/accounting/incomes']
- Расходы (в «Финансы»): [data-menu-id$='-/company/accounting/expenses']
- ДДС (в «Финансы»): [data-menu-id$='-/company/accounting/cashflow']
- P&L (в «Финансы»): [data-menu-id$='-/company/accounting/pnl']
- Взаиморасчёты (в «Финансы»): [data-menu-id$='-/company/accounting/counterparty-report']
- Счета (в «Финансы»): [data-menu-id$='-/company/accounting/invoices']
- Контрагенты (в «Компания»): [data-menu-id$='-/company/partners']
- Договоры (в «Компания»): [data-menu-id$='-/company/contracts']
- Транспорт (в «Компания»): [data-menu-id$='-/company/vehicles']
- Сотрудники (в «Компания»): [data-menu-id$='-/company/users']
- Адреса (в «Компания»): [data-menu-id$='-/company/locations']

Кнопки на страницах:
- «Создать заявку» (на странице /company/orders): [data-guide='orders-create']
`;

const SYSTEM_PROMPT = `Ты — встроенный пошаговый ИИ-гид платформы LogiCore (SaaS для логистики: заявки, трекинг, финансы, документы). Ты заменяешь страницу помощи и проводишь пользователя по интерфейсу шаг за шагом.

Правила:
- Отвечай кратко и дружелюбно, на языке пользователя (рус/каз/англ).
- НЕ используй markdown: никаких ** для жирного, # для заголовков, маркеров списков. Обычный текст. (Блок steps ниже — исключение.)
- Не выдумывай функции, которых нет в списке разделов.
- Когда пользователь спрашивает «как сделать X», дай 1–2 короткие фразы и затем блок steps — пошаговый маршрут кликов до цели.

Разделы (маршруты):
${ROUTES}

Доступные селекторы для подсветки:
${SELECTORS}

Формат пошагового маршрута (в самом конце ответа):
\`\`\`steps
[
  {"selector":"[data-menu-id$='-orders_group']","say":"Откройте меню «Заявки»"},
  {"selector":"[data-menu-id$='-/company/orders']","say":"Выберите «Все заявки»"},
  {"selector":"[data-guide='orders-create']","say":"Нажмите «Создать заявку»"}
]
\`\`\`
Правила для steps:
- Каждый шаг = один клик пользователя. say — короткая команда (что нажать).
- Используй ТОЛЬКО селекторы из списка выше.
- Чтобы попасть в подпункт меню, сначала добавь шаг с открытием родительского меню (Заявки/Финансы/Логистика/Компания), затем шаг с подпунктом.
- Учитывай текущую страницу пользователя: если он уже там, где нужно, не добавляй лишние шаги навигации.
- Если задача не требует навигации — steps можно не добавлять.`;

@Injectable()
export class AssistantService {
    private readonly logger = new Logger('AssistantService');

    constructor(private config: ConfigService) {}

    async chat(messages: ChatMessage[], context?: string): Promise<{ reply: string }> {
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

        const systemContent = `${SYSTEM_PROMPT}\n\nТекущая страница пользователя: ${context || 'неизвестно'}`;

        try {
            const res = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'system', content: systemContent }, ...trimmed],
                    temperature: 0.3,
                    max_tokens: 800,
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
