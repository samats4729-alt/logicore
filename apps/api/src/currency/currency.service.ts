import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BASE_CURRENCY, CURRENCY_CATALOG } from './currency-catalog';
import { nbkDateParam, parseNbkRates } from './nbk-rates.parser';

/** Откуда берём официальный курс. */
const NBK_URL = 'https://nationalbank.kz/rss/get_rates.cfm';
/** Сеть может молчать сколько угодно — приложение ждать столько не может. */
const FETCH_TIMEOUT_MS = 20_000;
/**
 * За сколько дней назад тянем курсы, чтобы показать таблицу на дату.
 *
 * Окно нужно, чтобы не делать по два запроса на каждую из полусотни валют:
 * на удалённой базе это полторы сотни походов и несколько секунд ожидания.
 * Две недели с запасом перекрывают любые выходные и праздники; если у
 * валюты в окне ничего нет, курс догружается отдельным запросом.
 */
const RATE_WINDOW_DAYS = 14;

export interface RateRow {
    code: string;
    nameRu: string;
    symbol: string | null;
    quant: number;
    isCommon: boolean;
    hasOfficialRate: boolean;
    /** Тенге за одну единицу. Для тенге всегда 1. */
    rate: number | null;
    /** На какую дату этот курс объявлен. Может быть раньше запрошенной. */
    rateDate: string | null;
    /** Курс и кратность как их отдал Нацбанк — для сверки с сайтом. */
    sourceRate: number | null;
    sourceQuant: number | null;
    /** NBK — официальный, COMPANY — свой курс компании, BASE — учётная валюта. */
    source: string | null;
    note: string | null;
    /** Курс объявлен раньше запрошенной даты: выходные, праздники, пропуски. */
    isCarriedOver: boolean;
    /** Изменение к предыдущему объявленному курсу, в тенге. */
    change: number | null;
}

/** Дата без времени: курс объявляется на день, а не на момент. */
function atMidnightUtc(value: string | Date): Date {
    const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Неверная дата');
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const asDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Сегодняшний день по местному времени, а не по Гринвичу.
 *
 * Казахстан на пять часов впереди: с полуночи до пяти утра по Алматы в
 * Гринвиче ещё вчера. Считать «сегодня» по Гринвичу значит показывать
 * бухгалтеру вчерашний курс, когда она приходит рано.
 */
export function localToday(now: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

@Injectable()
export class CurrencyService {
    private readonly logger = new Logger('CurrencyService');

    constructor(private prisma: PrismaService) { }

    /**
     * Завести справочник валют, если его ещё нет.
     *
     * Названия и порядок обновляем при каждом запуске: справочник живёт в
     * коде, и правка названия должна доезжать. Кратность не трогаем — её
     * главный источник Нацбанк, она приходит с курсом.
     */
    async ensureCatalog() {
        for (const currency of CURRENCY_CATALOG) {
            await this.prisma.currency.upsert({
                where: { code: currency.code },
                create: {
                    code: currency.code,
                    nameRu: currency.nameRu,
                    symbol: currency.symbol ?? null,
                    quant: currency.quant,
                    isCommon: currency.isCommon,
                    hasOfficialRate: currency.hasOfficialRate ?? true,
                    sortOrder: currency.sortOrder,
                },
                update: {
                    nameRu: currency.nameRu,
                    symbol: currency.symbol ?? null,
                    isCommon: currency.isCommon,
                    hasOfficialRate: currency.hasOfficialRate ?? true,
                    sortOrder: currency.sortOrder,
                },
            });
        }
        return this.prisma.currency.count();
    }

    listCurrencies() {
        return this.prisma.currency.findMany({
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
    }

    /**
     * Курс валюты на дату для конкретной компании.
     *
     * Порядок поиска: сперва свой курс компании, потом официальный. Свой
     * курс главнее намеренно — если компания зафиксировала курс в договоре
     * с клиентом, официальный к её счетам отношения не имеет.
     *
     * И тот, и другой ищутся с откатом назад: берётся последняя запись не
     * позже нужного дня. Это нужно для дней, которых в базе нет, — сервис
     * Нацбанка был недоступен, компания начала работать позже, документ
     * проводят задним числом. Без отката такой документ остался бы без
     * курса вовсе, а это пустая сумма в счёте.
     */
    async rateOn(
        code: string,
        date: string | Date,
        options: { companyId?: string } = {},
    ): Promise<{ rate: Prisma.Decimal; rateDate: Date; source: string } | null> {
        const day = atMidnightUtc(date);
        if (code === BASE_CURRENCY) {
            return { rate: new Prisma.Decimal(1), rateDate: day, source: 'BASE' };
        }

        if (options.companyId) {
            const own = await this.prisma.companyExchangeRate.findFirst({
                where: { companyId: options.companyId, currencyCode: code, rateDate: { lte: day } },
                orderBy: { rateDate: 'desc' },
                select: { rate: true, rateDate: true },
            });
            if (own) return { ...own, source: 'COMPANY' };
        }

        const official = await this.prisma.exchangeRate.findFirst({
            where: { currencyCode: code, rateDate: { lte: day } },
            orderBy: { rateDate: 'desc' },
            select: { rate: true, rateDate: true },
        });
        return official ? { ...official, source: 'NBK' } : null;
    }

    /**
     * Таблица курсов на дату — то, что видит человек на экране.
     *
     * Для каждой валюты берётся последний курс не позже запрошенного дня, и
     * отдельно помечается, что он «перенесён» с прежней даты: человек должен
     * видеть разницу между «курс на сегодня» и «сегодня курса не было».
     */
    async ratesOn(
        date: string,
        options: { onlyCommon?: boolean; companyId?: string } = {},
    ): Promise<RateRow[]> {
        const day = atMidnightUtc(date);
        const windowStart = new Date(day.getTime() - RATE_WINDOW_DAYS * 86_400_000);

        const currencies = await this.prisma.currency.findMany({
            where: options.onlyCommon ? { isCommon: true } : {},
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });

        // Одним запросом за окно, а не по два на каждую валюту.
        const [officialWindow, companyWindow] = await Promise.all([
            this.prisma.exchangeRate.findMany({
                where: { rateDate: { lte: day, gte: windowStart } },
                orderBy: { rateDate: 'desc' },
            }),
            options.companyId
                ? this.prisma.companyExchangeRate.findMany({
                    where: { companyId: options.companyId, rateDate: { lte: day, gte: windowStart } },
                    orderBy: { rateDate: 'desc' },
                })
                : Promise.resolve([] as any[]),
        ]);

        const group = <T extends { currencyCode: string }>(rows: T[]) => {
            const map = new Map<string, T[]>();
            for (const row of rows) {
                const list = map.get(row.currencyCode);
                if (list) list.push(row); else map.set(row.currencyCode, [row]);
            }
            return map;
        };
        const officialBy = group(officialWindow);
        const companyBy = group(companyWindow);

        const rows: RateRow[] = [];
        for (const currency of currencies) {
            if (currency.code === BASE_CURRENCY) {
                rows.push({
                    code: currency.code, nameRu: currency.nameRu, symbol: currency.symbol,
                    quant: currency.quant, isCommon: currency.isCommon,
                    hasOfficialRate: currency.hasOfficialRate,
                    rate: 1, rateDate: asDay(day),
                    sourceRate: null, sourceQuant: null, source: 'BASE', note: null,
                    isCarriedOver: false, change: null,
                });
                continue;
            }

            // Свой курс компании главнее официального.
            const own = companyBy.get(currency.code) || [];
            const official = officialBy.get(currency.code) || [];
            const useOwn = own.length > 0;
            const list: any[] = useOwn ? own : official;

            let current = list[0];
            let previous = list[1];

            // В окно ничего не попало — значит курс старше двух недель.
            // Такое бывает у валюты без официального курса и на пустой базе:
            // доходим отдельным запросом, чтобы не соврать «курса нет».
            if (!current) {
                const found = await this.rateOn(currency.code, date, { companyId: options.companyId });
                if (found) {
                    current = { rate: found.rate, rateDate: found.rateDate, note: null, sourceRate: null, sourceQuant: null };
                }
            }

            rows.push({
                code: currency.code,
                nameRu: currency.nameRu,
                symbol: currency.symbol,
                quant: currency.quant,
                isCommon: currency.isCommon,
                hasOfficialRate: currency.hasOfficialRate,
                rate: current ? Number(current.rate) : null,
                rateDate: current ? asDay(current.rateDate) : null,
                sourceRate: current?.sourceRate ? Number(current.sourceRate) : null,
                sourceQuant: current?.sourceQuant ?? null,
                source: current ? (useOwn ? 'COMPANY' : 'NBK') : null,
                note: current?.note ?? null,
                isCarriedOver: !!current && asDay(current.rateDate) !== asDay(day),
                change: current && previous ? Number(current.rate) - Number(previous.rate) : null,
            });
        }
        return rows;
    }

    /** История одной валюты за период — для проверки глазами. */
    async history(code: string, from: string, to: string, options: { companyId?: string } = {}) {
        const range = { gte: atMidnightUtc(from), lte: atMidnightUtc(to) };
        const [official, own] = await Promise.all([
            this.prisma.exchangeRate.findMany({
                where: { currencyCode: code, rateDate: range },
                orderBy: { rateDate: 'desc' },
            }),
            options.companyId
                ? this.prisma.companyExchangeRate.findMany({
                    where: { companyId: options.companyId, currencyCode: code, rateDate: range },
                    orderBy: { rateDate: 'desc' },
                    include: { createdBy: { select: { firstName: true, lastName: true } } },
                })
                : Promise.resolve([] as any[]),
        ]);
        return {
            official: official.map((r) => ({ ...r, source: 'NBK' })),
            company: own.map((r) => ({ ...r, source: 'COMPANY' })),
        };
    }

    /**
     * Загрузить официальные курсы Нацбанка на дату.
     *
     * Дата берётся ИЗ ФАЙЛА, а не из запроса. Проверено на живом сервисе: на
     * выходные Нацбанк отдаёт файл, помеченный запрошенной датой, но с
     * числами последнего рабочего дня — то есть по субботе и воскресенью
     * действует пятничный курс. Дата из файла — единственное, что сам сервис
     * считает правдой, поэтому верим ей.
     *
     * Своих курсов компаний загрузка не касается вовсе: это разные таблицы.
     */
    async importFromNbk(date: string, options: { userId?: string } = {}) {
        const requested = atMidnightUtc(date);
        const xml = await this.fetchNbk(requested);
        const parsed = parseNbkRates(xml);

        if (!parsed.rates.length) {
            throw new BadRequestException('Нацбанк вернул файл без курсов');
        }

        const fileDay = parsed.date && /^\d{2}\.\d{2}\.\d{4}$/.test(parsed.date)
            ? atMidnightUtc(parsed.date.split('.').reverse().join('-'))
            : requested;

        const known = new Set((await this.prisma.currency.findMany({ select: { code: true } })).map((c) => c.code));
        let saved = 0;
        const unknown: string[] = [];

        for (const rate of parsed.rates) {
            if (rate.code === BASE_CURRENCY) continue;
            if (!known.has(rate.code)) { unknown.push(rate.code); continue; }

            await this.prisma.exchangeRate.upsert({
                where: { currencyCode_rateDate: { currencyCode: rate.code, rateDate: fileDay } },
                create: {
                    currencyCode: rate.code,
                    rateDate: fileDay,
                    rate: new Prisma.Decimal(rate.rate.toFixed(6)),
                    sourceRate: new Prisma.Decimal(rate.sourceRate.toFixed(6)),
                    sourceQuant: rate.quant,
                    createdById: options.userId ?? null,
                },
                update: {
                    rate: new Prisma.Decimal(rate.rate.toFixed(6)),
                    sourceRate: new Prisma.Decimal(rate.sourceRate.toFixed(6)),
                    sourceQuant: rate.quant,
                },
            });
            saved += 1;

            // Кратность в справочнике — наша копия; главная у Нацбанка.
            // Расхождение не ломает загрузку, но молчать о нём нельзя:
            // изменение кратности меняет курс в 10 или 100 раз.
            const catalogQuant = CURRENCY_CATALOG.find((c) => c.code === rate.code)?.quant;
            if (catalogQuant && catalogQuant !== rate.quant) {
                this.logger.warn(
                    `Кратность ${rate.code} изменилась: в справочнике ${catalogQuant}, у Нацбанка ${rate.quant}`,
                );
            }
        }

        if (unknown.length) {
            this.logger.warn(`Нацбанк прислал валюты, которых нет в справочнике: ${unknown.join(', ')}`);
        }

        return {
            requestedDate: asDay(requested),
            rateDate: asDay(fileDay),
            /** Курс объявлен на другую дату, чем спрашивали. */
            isCarriedOver: asDay(fileDay) !== asDay(requested),
            saved,
            unknown,
        };
    }

    /**
     * Догрузить курсы за период.
     *
     * Нужно после того, как сервис Нацбанка был недоступен: дыры в истории
     * означают, что документ задним числом не сможет получить курс своей
     * даты. Ограничение по длине периода намеренное — это поход в чужой
     * сервис, а не запрос к своей базе.
     */
    async backfill(from: string, to: string, options: { userId?: string } = {}) {
        const start = atMidnightUtc(from);
        const end = atMidnightUtc(to);
        if (start > end) throw new BadRequestException('Начало периода позже конца');

        const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
        if (days > 92) throw new BadRequestException('За один раз можно догрузить не больше трёх месяцев');

        const done: string[] = [];
        const failed: { date: string; reason: string }[] = [];
        for (let i = 0; i < days; i += 1) {
            const day = new Date(start.getTime() + i * 86_400_000);
            try {
                const result = await this.importFromNbk(asDay(day), options);
                done.push(result.rateDate);
            } catch (e: any) {
                failed.push({ date: asDay(day), reason: e?.message || 'неизвестная ошибка' });
            }
        }
        return { days, loaded: [...new Set(done)].length, failed };
    }

    /**
     * Поставить компании свой курс.
     *
     * Зачем это есть: у туркменского маната официального курса Нацбанка нет
     * вовсе, сервис бывает недоступен, а иногда в договоре с клиентом
     * зафиксирован свой курс.
     *
     * Курс принадлежит компании и другим компаниям платформы не виден.
     * Официальный курс он не трогает и не затирает — это разные таблицы,
     * поэтому ночная загрузка Нацбанка своему курсу ничего не сделает.
     */
    async setCompanyRate(input: {
        companyId: string;
        code: string;
        date: string;
        rate: number;
        note?: string;
        userId?: string;
    }) {
        if (!input.companyId) throw new BadRequestException('Не указана компания');
        const currency = await this.prisma.currency.findUnique({ where: { code: input.code } });
        if (!currency) throw new NotFoundException('Валюта не найдена в справочнике');
        if (input.code === BASE_CURRENCY) {
            throw new BadRequestException('У тенге не бывает курса к тенге');
        }
        if (!(input.rate > 0)) throw new BadRequestException('Курс должен быть больше нуля');

        const day = atMidnightUtc(input.date);
        return this.prisma.companyExchangeRate.upsert({
            where: {
                companyId_currencyCode_rateDate: {
                    companyId: input.companyId, currencyCode: input.code, rateDate: day,
                },
            },
            create: {
                companyId: input.companyId,
                currencyCode: input.code,
                rateDate: day,
                rate: new Prisma.Decimal(input.rate.toFixed(6)),
                note: input.note?.slice(0, 300) || null,
                createdById: input.userId ?? null,
            },
            update: {
                rate: new Prisma.Decimal(input.rate.toFixed(6)),
                note: input.note?.slice(0, 300) || null,
                createdById: input.userId ?? null,
            },
        });
    }

    /** Убрать свой курс — вернуться к официальному. */
    async removeCompanyRate(companyId: string, code: string, date: string) {
        const day = atMidnightUtc(date);
        const existing = await this.prisma.companyExchangeRate.findUnique({
            where: { companyId_currencyCode_rateDate: { companyId, currencyCode: code, rateDate: day } },
        });
        if (!existing) throw new NotFoundException('Свой курс на эту дату не найден');
        await this.prisma.companyExchangeRate.delete({ where: { id: existing.id } });
        return { removed: true };
    }

    private async fetchNbk(date: Date): Promise<string> {
        const url = `${NBK_URL}?fdate=${nbkDateParam(date)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                throw new BadRequestException(`Нацбанк ответил ошибкой ${response.status}`);
            }
            return await response.text();
        } catch (e: any) {
            if (e instanceof BadRequestException) throw e;
            // Понятная причина вместо «fetch failed»: этот текст увидит бухгалтер.
            throw new BadRequestException(
                e?.name === 'AbortError'
                    ? 'Сайт Нацбанка не ответил вовремя — попробуйте позже'
                    : 'Не удалось связаться с сайтом Нацбанка',
            );
        } finally {
            clearTimeout(timer);
        }
    }
}
