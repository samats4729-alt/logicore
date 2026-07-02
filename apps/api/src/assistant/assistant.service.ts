import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const ROUTES = `
- /company — Дашборд (общая сводка)
- /company/orders — Все заявки
- /company/orders/create — Создание заявки
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

const SUPPORT_PROMPT = `Ты — ИИ-агент поддержки платформы LogiCore (SaaS для логистики: заявки, трекинг, финансы, счета, документы). Пользователь обращается, когда что-то работает неправильно: неверные цифры, статусы, счета, отображение. Твой отчёт читает разработчик, у которого НЕТ доступа к пользователю — отчёт должен быть самодостаточным.

Твоя задача:
1. Понять проблему. Свериться с реальными данными компании пользователя (блок «Данные» ниже) — номера заявок, суммы, статусы оплат, счета.
2. Восстановить бизнес-процесс. Для логических/финансовых проблем обязательно выясни цепочку: кто заказчик, кто экспедитор, кто перевозчик/суб-экспедитор, какие ставки, кто кому платил. Если из данных и слов пользователя это не ясно — задай 1–2 коротких уточняющих вопроса (какая цифра должна быть и почему; на каком экране смотрит).
3. Когда проблема ясна — сформулируй отчёт для разработчика и заверши ответ блоком:

\`\`\`ticket
{"title":"Краткая суть (до 80 символов)","category":"finance","severity":"medium","process":"Бизнес-процесс по шагам: участники (заказчик/экспедитор/перевозчик), их ставки, что пользователь делал и в какой последовательности","where":"Экран и место, где видна проблема (например: Финансы -> Взаиморасчёты, строка LC-...; или Заявка LC-... -> вкладка Финансы)","expected":"Что должно быть по логике пользователя — с конкретными цифрами и почему","actual":"Что показывает система на самом деле — с конкретными цифрами из данных","description":"Резюме для разработчика в 2-4 предложения: суть расхождения и вероятная зона (расчёт/отображение/данные)","orders":["LC-20260101-0001"]}
\`\`\`

Правила:
- category: finance | orders | documents | display | other. severity: low | medium | high (high — неверные деньги/блокирует работу).
- Для category finance и orders поля process, expected, actual ОБЯЗАТЕЛЬНЫ и должны содержать цифры. Для простых визуальных багов (documents/display) process можно опустить, но where — обязателен.
- Не выдумывай данные. Ожидаемое — со слов пользователя, фактическое — из блока «Данные». Если данные противоречат словам пользователя — прямо напиши об этом в actual.
- Пиши обычным текстом без markdown-разметки (никаких ** и #). Блок ticket — единственное исключение.
- После блока ticket добавь фразу: «Если всё верно — нажмите "Отправить в поддержку"».
- Отвечай на языке пользователя.`;

@Injectable()
export class AssistantService {
    private readonly logger = new Logger('AssistantService');

    constructor(
        private config: ConfigService,
        private prisma: PrismaService,
    ) {}

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

    // ==================== SUPPORT ====================

    /** Компактная сводка данных компании для агента поддержки */
    private async buildSupportData(companyId: string, lastUserMessage: string): Promise<string> {
        const participation = [
            { customerCompanyId: companyId },
            { forwarderId: companyId },
            { partnerId: companyId },
            { subForwarderId: companyId },
        ];

        const [company, orders, invoices] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, bin: true } }),
            this.prisma.order.findMany({
                where: { OR: participation },
                orderBy: { createdAt: 'desc' },
                take: 12,
                select: {
                    orderNumber: true, status: true,
                    customerPrice: true, driverCost: true, subForwarderPrice: true,
                    isCustomerPaid: true, isDriverPaid: true, isSubForwarderPaid: true,
                    outgoingInvoiceId: true, incomingInvoiceId: true,
                    customerCompany: { select: { name: true } },
                    forwarder: { select: { name: true } },
                    subForwarder: { select: { name: true } },
                },
            }),
            this.prisma.invoice.findMany({
                where: { OR: [{ issuerId: companyId }, { recipientId: companyId }] },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    invoiceNumber: true, type: true, status: true, amount: true,
                    issuer: { select: { name: true } }, recipient: { select: { name: true } },
                },
            }),
        ]);

        const lines: string[] = [];
        lines.push(`Компания: ${company?.name || '—'} (БИН ${company?.bin || '—'})`);
        lines.push('');
        lines.push('Последние заявки:');
        for (const o of orders) {
            lines.push(
                `${o.orderNumber} | ${o.status} | заказчик: ${o.customerCompany?.name || '—'} | исполнитель: ${o.subForwarder?.name || o.forwarder?.name || '—'} | цена заказчика: ${o.customerPrice ?? '—'} | ставка исполнителя: ${o.subForwarderPrice ?? o.driverCost ?? '—'} | оплата заказчика: ${o.isCustomerPaid ? 'да' : 'нет'} | оплата исполнителя: ${(o.isSubForwarderPaid || o.isDriverPaid) ? 'да' : 'нет'} | счета: ${o.outgoingInvoiceId ? 'исх✓' : 'исх—'}/${o.incomingInvoiceId ? 'вх✓' : 'вх—'}`,
            );
        }
        lines.push('');
        lines.push('Последние счета:');
        for (const inv of invoices) {
            lines.push(`${inv.invoiceNumber} | ${inv.type} | ${inv.status} | сумма ${inv.amount} | от ${inv.issuer?.name || '—'} для ${inv.recipient?.name || '—'}`);
        }

        // Упомянутые заявки — детально, с платежами
        const mentioned = Array.from(new Set(lastUserMessage.match(/LC-\d{8}-\d{4}/g) || [])).slice(0, 3);
        if (mentioned.length > 0) {
            const detailed = await this.prisma.order.findMany({
                where: { orderNumber: { in: mentioned }, OR: participation },
                include: {
                    payments: {
                        where: { isDeleted: false },
                        select: { direction: true, amount: true, date: true, companyId: true, note: true },
                    },
                },
            });
            for (const o of detailed) {
                lines.push('');
                lines.push(`Детально ${o.orderNumber}: статус ${o.status}, цена заказчика ${o.customerPrice ?? '—'}, ставка перевозчика ${o.driverCost ?? '—'}, ставка суб-экспедитора ${o.subForwarderPrice ?? '—'}`);
                lines.push(`Платежи (${o.payments.length}):`);
                for (const p of o.payments) {
                    lines.push(`  ${p.direction} ${p.amount} от ${new Date(p.date).toLocaleDateString('ru-RU')} (компания ${p.companyId === companyId ? 'наша' : 'контрагент'})${p.note ? ` — ${p.note}` : ''}`);
                }
            }
        }

        return lines.join('\n');
    }

    async supportChat(messages: ChatMessage[], userId: string, companyId: string): Promise<{ reply: string }> {
        const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
        if (!apiKey) {
            return { reply: 'Поддержка пока не настроена: не задан ключ DEEPSEEK_API_KEY. Обратитесь к администратору.' };
        }

        const trimmed = (messages || [])
            .filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant'))
            .slice(-12)
            .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

        if (trimmed.length === 0) {
            return { reply: 'Опишите проблему — что работает неправильно?' };
        }

        const lastUser = [...trimmed].reverse().find((m) => m.role === 'user')?.content || '';
        let dataBlock = '';
        try {
            dataBlock = await this.buildSupportData(companyId, lastUser);
        } catch (e) {
            this.logger.error(`buildSupportData failed: ${(e as Error).message}`);
        }

        const systemContent = `${SUPPORT_PROMPT}\n\n=== Данные компании пользователя ===\n${dataBlock || 'нет данных'}`;

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
                    temperature: 0.2,
                    max_tokens: 900,
                    stream: false,
                }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                this.logger.error(`DeepSeek support error ${res.status}: ${text}`);
                return { reply: 'Сейчас не получается ответить. Попробуйте чуть позже.' };
            }

            const data: any = await res.json();
            const reply = data?.choices?.[0]?.message?.content?.trim();
            return { reply: reply || 'Не удалось сформировать ответ.' };
        } catch (e) {
            this.logger.error(`DeepSeek support request failed: ${(e as Error).message}`);
            return { reply: 'Сервис поддержки временно недоступен. Попробуйте позже.' };
        }
    }

    async createTicket(
        userId: string,
        companyId: string,
        dto: {
            title: string;
            category?: string;
            severity?: string;
            description: string;
            process?: string;
            where?: string;
            expected?: string;
            actual?: string;
            orders?: string[];
            transcript?: { role: string; content: string }[];
        },
    ) {
        const [user, company] = await Promise.all([
            this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } }),
            this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
        ]);

        const ticket = await this.prisma.supportTicket.create({
            data: {
                companyId,
                companyName: company?.name || '—',
                userId,
                userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || '—',
                userEmail: user?.email || null,
                title: String(dto.title || 'Обращение').slice(0, 200),
                category: dto.category || 'other',
                severity: dto.severity || 'medium',
                description: String(dto.description || '').slice(0, 8000),
                orders: (dto.orders || []).slice(0, 20),
                details: (dto.process || dto.where || dto.expected || dto.actual)
                    ? ({
                        process: dto.process ? String(dto.process).slice(0, 4000) : undefined,
                        where: dto.where ? String(dto.where).slice(0, 1000) : undefined,
                        expected: dto.expected ? String(dto.expected).slice(0, 4000) : undefined,
                        actual: dto.actual ? String(dto.actual).slice(0, 4000) : undefined,
                    } as any)
                    : undefined,
                transcript: dto.transcript ? (dto.transcript.slice(-20) as any) : undefined,
            },
        });

        return { id: ticket.id, createdAt: ticket.createdAt };
    }

    async listTickets(status?: string) {
        return this.prisma.supportTicket.findMany({
            where: status ? { status } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }

    async updateTicketStatus(id: string, status: string) {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (!ticket) throw new NotFoundException('Тикет не найден');
        return this.prisma.supportTicket.update({ where: { id }, data: { status } });
    }
}
