import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { buildSupportTicketMessage } from '../telegram/support-ticket-message';
import { PLATFORM_KNOWLEDGE, describeUser } from './platform-knowledge';

/**
 * Сколько накопившихся обращений досылать при запуске за один раз.
 * Тридцать — это уже длинная лента в телеграме; больше за раз не отправляем,
 * про остаток сообщаем отдельным сообщением.
 */
const STARTUP_BACKLOG_LIMIT = 30;

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// ВАЖНО: этот список и SELECTORS ниже описывают реальный интерфейс. Их
// сверяет assistant.service.spec.ts — тест падает, если маршрут или пункт
// меню исчез. Без него карта тихо расходится с приложением, и гид начинает
// уверенно вести пользователя в никуда (так уже случилось с /company/accounting
// и несуществующими меню finance_group/transport_group).
export const ROUTES = `
Верхнее меню — пять пунктов и аватар. Всё остальное лежит на страницах-хабах.

Прямо из меню:
- /company — Дашборд: сводка по компании, плитка «Тариф», задолженность, последние события
- /company/orders — Заявки: журнал всех рейсов
- /company/orders/create — Создание заявки (мастер по шагам)
- /company/requests — Запросы: хаб, куда приходят запросы на расчёт от заказчиков
- /company/tracking — Карта и GPS: где сейчас транспорт
- /company/warehouse — Очередь на погрузку
- /company/finance — «Деньги»: хаб со списком всего денежного
- /company/reports — «Отчёты»: хаб со списком отчётов
- /company/cabinet — «Кабинет»: хаб со справочниками и настройками компании

Хаб «Деньги» (/company/finance) — оттуда открывается:
- /company/accounting/incoming — Входящие документы: счета и акты, присланные контрагентами; принять или отклонить
- /company/accounting/invoices — Счета: покупателям и от поставщиков
- /company/accounting/invoices/create — Создание счёта
- /company/accounting/acts — Акты выполненных работ по заявкам
- /company/accounting/act-of-work — Акт выполненных работ: сводный по периоду
- /company/accounting/transport-documents — Доверенности и договоры-заявки: печать документов по рейсам
- /company/accounting/cash-in — Приход денег: заказчик оплатил
- /company/accounting/cash-out — Расход денег: оплатили перевозчику или за топливо
- /company/accounting/operations — Все операции: вся история движения денег
- /company/accounting/calendar — Платёжный календарь: что и когда движется по деньгам
- /company/accounting/planned — Планируемые платежи: что предстоит заплатить и получить
- /company/accounting/counterparty-report — Взаиморасчёты: кто кому должен, просрочка, сверка
- /company/accounting/reconciliation-act — Акт сверки с контрагентом
- /company/accounting/balances — Остатки по кассам и счетам
- /company/accounting/opening-balances — Ввод начальных остатков при запуске учёта
- /company/inventory/receipts — Поступление материалов: купили масло, шины, запчасти
- /company/inventory/writeoffs — Списание материалов: залили в машину, поставили на ремонт
- /company/inventory/balances — Остатки материалов
- /company/inventory/transfers — Перемещение материалов между складами
- /company/payroll — Зарплата: начисления и выплаты сотрудникам
- /company/my-salary — Моя зарплата

Хаб «Отчёты» (/company/reports) — оттуда открывается:
- /company/accounting/pnl — Прибыли и убытки
- /company/accounting/cashflow — Движение денежных средств
- /company/accounting/registry — Реестр заявок
- /company/accounting/carrier-profit — Прибыль по перевозчикам
- /company/accounting/expenses-by-category — Расходы по статьям

Хаб «Запросы» (/company/requests) — оттуда открывается:
- /company/calculator — Калькулятор стоимости перевозки

Хаб «Кабинет» (/company/cabinet) — оттуда открывается:
- /company/partners — Контрагенты
- /company/contracts — Договоры
- /company/locations — Адреса и склады
- /company/vehicles — Автопарк
- /company/users — Сотрудники (там же права доступа и водители)
- /company/documents — Документы компании
- /company/audit — Журнал действий
- /company/profile — Мой профиль и смена пароля
- /company/settings — Организации и реквизиты
- /company/inventory/nomenclature — Номенклатура материалов
- /company/inventory/warehouses — Склады хранения
- /company/accounting/settings — Настройки бухгалтерии: статьи доходов и расходов, наименования услуг, счета и кассы
- /company/accounting/payment-conditions — Условия оплаты
- /company/accounting/payment-forms — Формы оплаты
- /company/accounting/ownership-types — Формы собственности
- /company/accounting/banks — Банки
- /company/accounting/currencies — Курсы валют
- /company/accounting/revaluation — Переоценка валютных остатков
- /company/accounting/order-numbering — Нумерация заявок
- /company/accounting/document-numbering — Нумерация счетов

Отдельно:
- /company/onboarding — первые шаги после регистрации компании
`;

export const SELECTORS = `
Верхнее меню (названия — ровно те, что видит человек на экране):
- «Дашборд»: [data-menu-id$='-/company']
- «Заявки» — сразу открывает журнал рейсов, без промежуточного меню: [data-menu-id$='-/company/orders']
- «Запросы» — хаб запросов на расчёт: [data-menu-id$='-/company/requests']
- «Мониторинг» — единственное выпадающее меню: [data-menu-id$='-monitoring_group']
- «Деньги» — хаб, НЕ выпадающее меню: [data-menu-id$='-/company/finance']
- «Отчёты» — хаб, НЕ выпадающее меню: [data-menu-id$='-/company/reports']
- «Кабинет» — хаб, НЕ выпадающее меню: [data-menu-id$='-/company/cabinet']
- Аватар справа вверху (меню профиля): [data-guide='profile']

Подпункты «Мониторинга» (видны только после клика по нему):
- «Карта и GPS»: [data-menu-id$='-/company/tracking']
- «Очередь на погрузку»: [data-menu-id$='-/company/warehouse']

Подпункты меню профиля (видны только после клика по аватару):
- «Настройки»: [data-menu-id$='-/company/settings']

ВАЖНО про хабы. «Деньги», «Отчёты», «Запросы» и «Кабинет» — это не выпадающие
меню, а страницы со списком разделов. Отдельных пунктов меню у самих разделов
нет. Путь всегда один: клик по хабу в верхнем меню, потом нужная ссылка на
открывшейся странице. Селекторов у ссылок хаба нет — назови раздел словами
ровно так, как он подписан на странице.
- «Деньги»: входящие документы, счета, акты, доверенности и договоры-заявки,
  приход и расход денег, все операции, платёжный календарь, планируемые платежи,
  взаиморасчёты, остатки по кассам, начальные остатки, материалы (поступление,
  списание, остатки, перемещение), зарплата.
- «Отчёты»: прибыли и убытки, движение денежных средств, реестр заявок,
  прибыль по перевозчикам, расходы по статьям.
- «Запросы»: калькулятор стоимости.
- «Кабинет»: контрагенты, договоры, адреса, автопарк, сотрудники и права,
  документы, журнал действий, профиль, организации и реквизиты, номенклатура и
  склады, справочники бухгалтерии (условия и формы оплаты, формы собственности,
  банки, курсы валют, переоценка, нумерация заявок и счетов), настройки
  бухгалтерии со статьями доходов и расходов и счетами-кассами.

Кнопки на страницах:
- «Создать заявку» (на /company/orders): [data-guide='orders-create']
- Глобальный поиск (в шапке): [data-guide='global-search']
- Центр уведомлений (колокольчик в шапке): [data-guide='notifications']
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
  {"selector":"[data-menu-id$='-/company/orders']","say":"Откройте «Заявки»"},
  {"selector":"[data-guide='orders-create']","say":"Нажмите «Создать заявку»"}
]
\`\`\`
Правила для steps:
- Каждый шаг = один клик пользователя. say — короткая команда (что нажать).
- Используй ТОЛЬКО селекторы из списка выше.
- Выпадающее меню только одно — «Мониторинг». Чтобы попасть в его подпункт, сначала добавь шаг с открытием самого меню, затем шаг с подпунктом. Для «Настроек» родитель — меню профиля [data-guide='profile'].
- «Деньги», «Отчёты», «Запросы» и «Кабинет» — не меню, а страницы-хабы: шаг с кликом по ним открывает страницу, дальше пользователь переходит по ссылке на ней. Отдельных селекторов у этих ссылок нет, поэтому последним шагом назови раздел словами, как он подписан на хабе.
- Заявки открываются одним кликом по пилюле, без промежуточного меню.
- Называй пункты меню ровно так, как они подписаны: «Деньги», а не «Финансы»; «Карта и GPS», а не «GPS»; «Очередь на погрузку», а не «Склад».
- Учитывай текущую страницу пользователя: если он уже там, где нужно, не добавляй лишние шаги навигации.
- Если задача не требует навигации — steps можно не добавлять.

Ты знаешь платформу не только как набор экранов, но и по существу — из блока ниже.
Отвечай на вопросы «что это такое», «зачем это нужно», «чем отличается» по нему, а не общими словами.
${PLATFORM_KNOWLEDGE}`;

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
export class AssistantService implements OnApplicationBootstrap {
    private readonly logger = new Logger('AssistantService');

    constructor(
        private config: ConfigService,
        private prisma: PrismaService,
        private telegram: TelegramService,
    ) {}

    onApplicationBootstrap() {
        // Run generation task asynchronously on startup so it does not block application startup
        this.runUpdateGenerationTask().catch(err => {
            this.logger.error(`Error in startup update generation: ${err.message}`);
        });

        // Run checking task every 12 hours
        setInterval(() => {
            this.runUpdateGenerationTask().catch(err => {
                this.logger.error(`Error in periodic update generation: ${err.message}`);
            });
        }, 12 * 60 * 60 * 1000);

        this.deliverBacklogOnStartup().catch((err) => {
            this.logger.error(`Досыл обращений при запуске не удался: ${err.message}`);
        });
    }

    /**
     * Досыл накопившегося сразу после запуска.
     *
     * Зачем: отправка появилась позже самих обращений, и всё, что было
     * создано до неё, в телеграм не уходило. Владелец вписывает ключ бота —
     * и ждёт, что накопившееся придёт. Требовать ради этого зайти в админку
     * и найти там кнопку — значит переложить на него нашу же недоделку.
     *
     * Пачка ограничена: если обращений накопились сотни, вывалить их разом
     * в мессенджер — не помощь, а мусор. Про остаток сообщаем прямо в
     * телеграме, чтобы человек узнал об этом там же, где читает.
     */
    private async deliverBacklogOnStartup(): Promise<void> {
        if (!this.telegram.isEnabled()) return;

        const pendingBefore = await this.countPendingTelegram();
        if (pendingBefore === 0) return;

        // Пауза, чтобы не соревноваться за сеть с остальным стартом.
        await new Promise((r) => setTimeout(r, 5000));

        const { sent, left } = await this.resendPendingTickets(STARTUP_BACKLOG_LIMIT);
        this.logger.log(`Досыл при запуске: отправлено ${sent}, осталось ${left}`);

        if (left > 0) {
            await this.telegram.send(
                `Это были не все: осталось ещё ${left} обращений.\n` +
                'Они придут при следующем перезапуске платформы или по кнопке ' +
                '«Отправить в телеграм» в админке, раздел «Поддержка».',
            );
        }
    }

    private async runUpdateGenerationTask() {
        this.logger.log('Starting automatic platform updates generation...');
        const res = await this.generatePlatformUpdates();
        this.logger.log(`Automatic platform updates generation completed: ${res.message}`);
    }

    /**
     * Ответ ИИ-гида.
     *
     * `user` — кто спрашивает. Роль берётся из токена, а не из тела запроса:
     * до этого гид не знал собеседника вовсе и одинаково уверенно вёл и
     * владельца, и завсклада в разделы, куда второго не пускают. Человек
     * доходил до отказа и решал, что сломалась платформа.
     */
    async chat(
        messages: ChatMessage[],
        context?: string,
        user?: { role?: string; permissions?: string[] },
    ): Promise<{ reply: string }> {
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

        const updatesBlock = await this.getPublishedUpdatesBlock();
        const systemContent = `${SYSTEM_PROMPT}${updatesBlock}`
            + `\n\n=== Кто спрашивает ===\n${describeUser(user)}`
            + `\n\nТекущая страница пользователя: ${context || 'неизвестно'}`;

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

        const [company, orders] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, bin: true } }),
            this.prisma.order.findMany({
                where: { OR: participation },
                orderBy: { createdAt: 'desc' },
                take: 12,
                select: {
                    orderNumber: true, status: true,
                    customerPrice: true, driverCost: true, subForwarderPrice: true,
                    isCustomerPaid: true, isDriverPaid: true, isSubForwarderPaid: true,
                    customerCompany: { select: { name: true } },
                    forwarder: { select: { name: true } },
                    subForwarder: { select: { name: true } },
                },
            }),
        ]);

        const lines: string[] = [];
        lines.push(`Компания: ${company?.name || '—'} (БИН ${company?.bin || '—'})`);
        lines.push('');
        lines.push('Последние заявки:');
        for (const o of orders) {
            lines.push(
                `${o.orderNumber} | ${o.status} | заказчик: ${o.customerCompany?.name || '—'} | исполнитель: ${o.subForwarder?.name || o.forwarder?.name || '—'} | цена заказчика: ${o.customerPrice ?? '—'} | ставка исполнителя: ${o.subForwarderPrice ?? o.driverCost ?? '—'} | оплата заказчика: ${o.isCustomerPaid ? 'да' : 'нет'} | оплата исполнителя: ${(o.isSubForwarderPaid || o.isDriverPaid) ? 'да' : 'нет'}`,
            );
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

        // Уведомление владельцу. Обращение уже сохранено, поэтому отправка
        // ничего не решает: не дошло — оно всё равно лежит в админке и его
        // можно досаслать оттуда кнопкой.
        await this.deliverTicketToTelegram(ticket);

        return { id: ticket.id, createdAt: ticket.createdAt };
    }

    /**
     * Отправить одно обращение в телеграм и запомнить, что оно ушло.
     *
     * Отметку ставим только при успехе: если телеграм промолчал, обращение
     * должно остаться в очереди на досыл, иначе оно потеряется навсегда.
     */
    private async deliverTicketToTelegram(ticket: any, resent = false): Promise<boolean> {
        const sent = await this.telegram.send(buildSupportTicketMessage({
            id: ticket.id,
            title: ticket.title,
            category: ticket.category,
            severity: ticket.severity,
            companyName: ticket.companyName,
            userName: ticket.userName,
            userEmail: ticket.userEmail,
            createdAt: ticket.createdAt,
            description: ticket.description,
            orders: ticket.orders,
            details: ticket.details as any,
            resent,
        }));

        if (sent) {
            await this.prisma.supportTicket
                .update({ where: { id: ticket.id }, data: { telegramSentAt: new Date() } })
                .catch((e) => this.logger.warn(`Не удалось отметить отправку обращения ${ticket.id}: ${e.message}`));
        }
        return sent;
    }

    /**
     * Досыл обращений, которые в телеграм ещё не уходили.
     *
     * Зачем: отправка появилась позже самих обращений, и всё, что накопилось
     * до неё, осталось лежать в админке. Плюс сюда же попадает всё, что не
     * ушло из-за недоступного мессенджера.
     *
     * Идём от старых к новым — так в телеграме они лягут в том порядке, в
     * котором происходили. Между сообщениями пауза: телеграм ограничивает
     * частоту, и без неё хвост пачки просто не дойдёт.
     */
    async resendPendingTickets(limit = 50): Promise<{ sent: number; failed: number; left: number }> {
        if (!this.telegram.isEnabled()) {
            throw new BadRequestException(
                'Телеграм не настроен: задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.',
            );
        }

        const safeLimit = Math.min(Math.max(1, limit), 100);
        const pending = await this.prisma.supportTicket.findMany({
            where: { telegramSentAt: null },
            orderBy: { createdAt: 'asc' },
            take: safeLimit,
        });

        let sent = 0;
        let failed = 0;
        for (let i = 0; i < pending.length; i++) {
            const ok = await this.deliverTicketToTelegram(pending[i], true);
            if (ok) sent++;
            else failed++;
            // Пауза только между сообщениями — после последнего ждать нечего.
            if (i < pending.length - 1) {
                await new Promise((r) => setTimeout(r, 350));
            }
        }

        const left = await this.prisma.supportTicket.count({ where: { telegramSentAt: null } });
        return { sent, failed, left };
    }

    /** Сколько обращений ещё ни разу не уходило в телеграм. */
    async countPendingTelegram(): Promise<number> {
        return this.prisma.supportTicket.count({ where: { telegramSentAt: null } });
    }

    /** Отправить одно конкретное обращение — даже если оно уже уходило. */
    async resendTicket(id: string): Promise<{ sent: boolean }> {
        if (!this.telegram.isEnabled()) {
            throw new BadRequestException(
                'Телеграм не настроен: задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.',
            );
        }
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
        if (!ticket) throw new NotFoundException('Тикет не найден');
        return { sent: await this.deliverTicketToTelegram(ticket, true) };
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

    // ==================== PLATFORM UPDATES (нововведения) ====================

    private updatesCache: { block: string; ts: number } | null = null;

    /** Блок опубликованных нововведений для системного промпта гида (кэш 5 минут) */
    private async getPublishedUpdatesBlock(): Promise<string> {
        if (this.updatesCache && Date.now() - this.updatesCache.ts < 5 * 60 * 1000) {
            return this.updatesCache.block;
        }
        let block = '';
        try {
            const updates = await this.prisma.platformUpdate.findMany({
                where: { status: 'PUBLISHED' },
                orderBy: { publishedAt: 'desc' },
                take: 6,
                select: { title: true, description: true, publishedAt: true },
            });
            if (updates.length > 0) {
                const lines = updates.map(u => `- ${u.title}: ${u.description}`);
                block = `\n\nНедавние обновления платформы (используй, когда спрашивают «что нового», и учитывай в подсказках):\n${lines.join('\n')}`;
            }
        } catch (e) {
            this.logger.warn(`getPublishedUpdatesBlock failed: ${(e as Error).message}`);
        }
        this.updatesCache = { block, ts: Date.now() };
        return block;
    }

    /** Последние коммиты репозитория через GitHub API */
    private async fetchRecentCommits(): Promise<{ sha: string; message: string; date: string }[]> {
        const repo = this.config.get<string>('GITHUB_REPO') || 'samats4729-alt/logicore';
        const token = this.config.get<string>('GITHUB_TOKEN');
        const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=40`, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'logicore-platform',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });
        if (!res.ok) {
            throw new Error(`GitHub API ${res.status}. Если репозиторий приватный — задайте переменную GITHUB_TOKEN (personal access token с правом repo).`);
        }
        const data: any[] = await res.json();
        return (data || [])
            .map(c => ({
                sha: c.sha as string,
                message: String(c.commit?.message || '').split('\n')[0],
                date: c.commit?.author?.date || '',
            }))
            .filter(c => c.message && !c.message.startsWith('Merge'));
    }

    /** ИИ читает новые коммиты и создаёт черновики анонсов для подтверждения админом */
    async generatePlatformUpdates(): Promise<{ created: number; message: string }> {
        const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
        if (!apiKey) return { created: 0, message: 'Не задан DEEPSEEK_API_KEY' };

        const commits = await this.fetchRecentCommits();

        // Дедупликация: не обрабатываем коммиты, уже фигурировавшие в анонсах
        const existing = await this.prisma.platformUpdate.findMany({ select: { sourceCommits: true } });
        const knownShas = new Set(existing.flatMap(u => u.sourceCommits));
        const fresh = commits.filter(c => !knownShas.has(c.sha));

        if (fresh.length === 0) {
            return { created: 0, message: 'Новых коммитов нет — все изменения уже обработаны' };
        }

        const commitList = fresh.map((c, i) => `${i + 1}. ${c.message}`).join('\n');
        const prompt = `Ты — продакт-менеджер логистической платформы LogiCore (заявки, финансы, GPS-трекинг, документы). Ниже список коммитов разработки.

Выбери ТОЛЬКО изменения, заметные пользователям платформы: новые возможности, изменения интерфейса, важные исправления поведения. Пропусти чисто техническое: рефакторинг, сборку, БД, внутренние фиксы, безопасность без видимого эффекта.

Сгруппируй связанные коммиты в анонсы и верни СТРОГО JSON-массив без пояснений и без markdown:
[{"title":"Заголовок до 60 символов","description":"1-3 предложения простым языком, без технических терминов","commitNumbers":[1,2]}]
Если пользовательских изменений нет — верни [].

Коммиты:
${commitList}`;

        const res = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 1200,
                stream: false,
            }),
        });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            this.logger.error(`DeepSeek updates error ${res.status}: ${t}`);
            return { created: 0, message: 'Сервис ИИ временно недоступен' };
        }
        const data: any = await res.json();
        let raw = (data?.choices?.[0]?.message?.content || '').trim();
        raw = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

        let items: { title: string; description: string; commitNumbers?: number[] }[] = [];
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) items = parsed;
        } catch {
            this.logger.error(`Failed to parse updates JSON: ${raw.slice(0, 300)}`);
            return { created: 0, message: 'ИИ вернул некорректный формат, попробуйте ещё раз' };
        }

        // Все свежие sha помечаем обработанными (раскладываем по анонсам, остаток — в первый)
        const usedShas = new Set<string>();
        let created = 0;
        for (const item of items) {
            if (!item?.title || !item?.description) continue;
            const shas = (item.commitNumbers || [])
                .map(n => fresh[n - 1]?.sha)
                .filter((s): s is string => !!s);
            shas.forEach(s => usedShas.add(s));
            await this.prisma.platformUpdate.create({
                data: {
                    title: String(item.title).slice(0, 120),
                    description: String(item.description).slice(0, 2000),
                    sourceCommits: shas,
                    status: 'DRAFT',
                },
            });
            created++;
        }

        // Технические коммиты без анонса тоже помечаем, чтобы не крутить их повторно
        const leftovers = fresh.filter(c => !usedShas.has(c.sha)).map(c => c.sha);
        if (leftovers.length > 0) {
            await this.prisma.platformUpdate.create({
                data: {
                    title: '[тех] Служебные изменения',
                    description: 'Технические коммиты без пользовательского эффекта (автопометка для дедупликации).',
                    sourceCommits: leftovers,
                    status: 'REJECTED',
                },
            });
        }


        return {
            created,
            message: created > 0
                ? `Создано черновиков: ${created} (из ${fresh.length} новых коммитов)`
                : `Обработано ${fresh.length} коммитов — пользовательских изменений не найдено`,
        };
    }

    async listPlatformUpdates(status?: string) {
        return this.prisma.platformUpdate.findMany({
            where: status ? { status } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }

    async updatePlatformUpdate(id: string, dto: { title?: string; description?: string; status?: string }) {
        const update = await this.prisma.platformUpdate.findUnique({ where: { id } });
        if (!update) throw new NotFoundException('Нововведение не найдено');
        const result = await this.prisma.platformUpdate.update({
            where: { id },
            data: {
                ...(dto.title !== undefined && { title: String(dto.title).slice(0, 120) }),
                ...(dto.description !== undefined && { description: String(dto.description).slice(0, 2000) }),
                ...(dto.status !== undefined && {
                    status: dto.status,
                    publishedAt: dto.status === 'PUBLISHED' ? new Date() : update.publishedAt,
                }),
            },
        });
        this.updatesCache = null; // сбрасываем кэш промпта гида
        return result;
    }

    async getPublishedPlatformUpdates() {
        return this.prisma.platformUpdate.findMany({
            where: { status: 'PUBLISHED' },
            orderBy: { publishedAt: 'desc' },
            take: 20,
            select: { id: true, title: true, description: true, publishedAt: true },
        });
    }
}
