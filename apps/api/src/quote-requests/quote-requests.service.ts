import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPaginationParams, PaginationQueryDto } from '../common/dto/pagination.dto';
import { palletLinesFromQuote } from '../common/utils/pallets';
import { buildDirectionMemory, buildQuoteMemory, DirectionMemory, PastQuote, QuoteMemory } from './quote-memory';
import { ContractsService } from '../contracts/contracts.service';
import { OrdersService } from '../orders/orders.service';
import { CitiesService } from '../cities/cities.service';

/** Поля, которые нужны, чтобы показать запрос в списке и в карточке. */
const QUOTE_INCLUDE = {
    customerCompany: { select: { id: true, name: true, bin: true } },
    originCity: { select: { id: true, name: true } },
    destinationCity: { select: { id: true, name: true } },
    originLocation: { select: { id: true, name: true, address: true } },
    destinationLocation: { select: { id: true, name: true, address: true } },
    order: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.QuoteRequestInclude;

@Injectable()
export class QuoteRequestsService {
    private readonly logger = new Logger(QuoteRequestsService.name);

    constructor(
        private prisma: PrismaService,
        private contracts: ContractsService,
        private orders: OrdersService,
        private cities: CitiesService,
    ) { }

    /**
     * Список запросов компании.
     *
     * Условия складываются через `AND`, а не подмешиваются в один объект:
     * иначе фильтр по клиенту или поиск способен перетереть привязку к
     * компании, и один перевозчик увидел бы запросы другого. На заявках
     * это уже чинили.
     */
    async findAll(companyId: string, query: QuoteRequestsQuery) {
        const { page, limit, skip, take } = getPaginationParams(query);

        const conditions: Prisma.QuoteRequestWhereInput[] = [{ companyId }];

        if (query.status) conditions.push({ status: query.status });
        if (query.customerCompanyId) conditions.push({ customerCompanyId: query.customerCompanyId });
        if (query.originCityId) conditions.push({ originCityId: query.originCityId });
        if (query.destinationCityId) conditions.push({ destinationCityId: query.destinationCityId });

        if (query.search?.trim()) {
            const like = { contains: query.search.trim(), mode: 'insensitive' as const };
            conditions.push({
                OR: [
                    { requestNumber: like },
                    { cargoDescription: like },
                    { natureOfCargo: like },
                    { customerCompany: { name: like } },
                    // И по названию текстом: у города из свободного ввода
                    // связи со справочником нет, а искать по нему надо.
                    { originCityName: like },
                    { destinationCityName: like },
                    { originCity: { name: like } },
                    { destinationCity: { name: like } },
                ],
            });
        }

        const where: Prisma.QuoteRequestWhereInput = { AND: conditions };

        const [data, total] = await Promise.all([
            this.prisma.quoteRequest.findMany({
                where,
                include: QUOTE_INCLUDE,
                orderBy: { createdAt: 'desc' },
                skip,
                take,
            }),
            this.prisma.quoteRequest.count({ where }),
        ]);

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findOne(companyId: string, id: string) {
        const request = await this.prisma.quoteRequest.findFirst({
            where: { id, companyId },
            include: QUOTE_INCLUDE,
        });
        if (!request) throw new NotFoundException('Запрос не найден');
        return request;
    }

    async create(companyId: string, userId: string, dto: CreateQuoteRequestData) {
        await this.assertRouteBelongsToUs(companyId, dto);

        const requestNumber = await this.generateNumber(companyId);
        const [origin, destination] = await this.resolveRoute(dto);

        return this.prisma.quoteRequest.create({
            data: {
                requestNumber,
                companyId,
                customerCompanyId: dto.customerCompanyId,
                originCityId: origin.id,
                originCityName: origin.name,
                originCityKey: origin.key,
                destinationCityId: destination.id,
                destinationCityName: destination.name,
                destinationCityKey: destination.key,
                originLocationId: dto.originLocationId || null,
                destinationLocationId: dto.destinationLocationId || null,
                originAddress: dto.originAddress || null,
                destinationAddress: dto.destinationAddress || null,
                readyDate: dto.readyDate ? new Date(dto.readyDate) : null,
                cargoDescription: dto.cargoDescription || null,
                natureOfCargo: dto.natureOfCargo || null,
                cargoType: dto.cargoType || null,
                cargoWeight: dto.cargoWeight ?? null,
                cargoVolume: dto.cargoVolume ?? null,
                palletCount: dto.palletCount ?? null,
                palletKind: dto.palletKind || null,
                carrierCost: dto.carrierCost ?? null,
                customerPrice: dto.customerPrice ?? null,
                notes: dto.notes || null,
                createdById: userId,
                // Цена названа сразу — значит запрос уже в работе, а не «новый».
                status: dto.customerPrice != null ? QuoteRequestStatus.IN_PROGRESS : QuoteRequestStatus.NEW,
                quotedAt: dto.customerPrice != null ? new Date() : null,
                quotedById: dto.customerPrice != null ? userId : null,
            },
            include: QUOTE_INCLUDE,
        });
    }

    async update(companyId: string, userId: string, id: string, dto: Partial<CreateQuoteRequestData>) {
        const existing = await this.findOne(companyId, id);

        if (existing.status === QuoteRequestStatus.APPROVED && existing.orderId) {
            throw new BadRequestException(
                'По запросу уже оформлена заявка — правки вносите в заявку, иначе данные разойдутся.',
            );
        }

        await this.assertRouteBelongsToUs(companyId, { ...existing, ...dto } as CreateQuoteRequestData);

        const data: Prisma.QuoteRequestUpdateInput = {};

        if (dto.customerCompanyId) data.customerCompany = { connect: { id: dto.customerCompanyId } };

        // Города правим только когда их прислали. Разбор идёт заново: человек
        // мог стереть подсказку и дописать название руками.
        if (dto.originCityName !== undefined || dto.originCityId !== undefined) {
            const origin = await this.cities.resolve(dto.originCityName, dto.originCityId);
            data.originCity = origin.id ? { connect: { id: origin.id } } : { disconnect: true };
            data.originCityName = origin.name;
            data.originCityKey = origin.key;
        }
        if (dto.destinationCityName !== undefined || dto.destinationCityId !== undefined) {
            const destination = await this.cities.resolve(dto.destinationCityName, dto.destinationCityId);
            data.destinationCity = destination.id ? { connect: { id: destination.id } } : { disconnect: true };
            data.destinationCityName = destination.name;
            data.destinationCityKey = destination.key;
        }

        assignIfPresent(dto, data, 'originAddress');
        assignIfPresent(dto, data, 'destinationAddress');
        assignIfPresent(dto, data, 'cargoDescription');
        assignIfPresent(dto, data, 'natureOfCargo');
        assignIfPresent(dto, data, 'cargoType');
        assignIfPresent(dto, data, 'notes');
        if (dto.cargoWeight !== undefined) data.cargoWeight = dto.cargoWeight ?? null;
        if (dto.cargoVolume !== undefined) data.cargoVolume = dto.cargoVolume ?? null;
        if (dto.palletCount !== undefined) data.palletCount = dto.palletCount ?? null;
        assignIfPresent(dto, data, 'palletKind');
        if (dto.carrierCost !== undefined) data.carrierCost = dto.carrierCost ?? null;
        if (dto.readyDate !== undefined) data.readyDate = dto.readyDate ? new Date(dto.readyDate) : null;

        if (dto.originLocationId !== undefined) {
            data.originLocation = dto.originLocationId
                ? { connect: { id: dto.originLocationId } }
                : { disconnect: true };
        }
        if (dto.destinationLocationId !== undefined) {
            data.destinationLocation = dto.destinationLocationId
                ? { connect: { id: dto.destinationLocationId } }
                : { disconnect: true };
        }

        // Появилась цена клиенту — значит КП отправлено. Запоминаем момент и
        // автора: через неделю «кто и когда назвал эту сумму» — первый вопрос.
        if (dto.customerPrice !== undefined) {
            data.customerPrice = dto.customerPrice ?? null;
            if (dto.customerPrice != null && existing.customerPrice === null) {
                data.quotedAt = new Date();
                data.quotedById = userId;
                if (existing.status === QuoteRequestStatus.NEW) {
                    data.status = QuoteRequestStatus.IN_PROGRESS;
                }
            }
        }

        return this.prisma.quoteRequest.update({ where: { id }, data, include: QUOTE_INCLUDE });
    }

    /**
     * Клиент согласился — из запроса сразу оформляется заявка.
     *
     * Раньше согласование только меняло отметку, а рейс менеджер заводил
     * заново руками: те же клиент, маршрут, груз и цены он набирал во
     * второй раз. Это и лишняя работа, и место, где цифры расходятся —
     * согласовали одну сумму, в заявку попала другая.
     *
     * Поэтому заявка создаётся здесь же, из тех данных, которые клиент и
     * согласовал. Дальше её дорабатывают как обычно: назначают водителя,
     * уточняют условия.
     */
    async approve(companyId: string, id: string, userId?: string) {
        const request = await this.findOne(companyId, id);

        if (request.customerPrice == null) {
            throw new BadRequestException(
                'Сначала укажите цену для клиента — иначе непонятно, что именно он согласовал.',
            );
        }

        // Повторное согласование не плодит второй рейс. Кнопку нажимают
        // дважды чаще, чем кажется, а лишняя заявка попадает в журнал, в
        // отчёты и в зарплату менеджера.
        if (request.orderId) {
            return this.prisma.quoteRequest.update({
                where: { id },
                data: { status: QuoteRequestStatus.APPROVED, decidedAt: new Date(), rejectionReason: null },
                include: QUOTE_INCLUDE,
            });
        }

        // Точки маршрута заявка берёт из справочника адресов — по названию
        // города рейс не построить.
        //
        // Но согласие клиента — это факт, и записать его нужно сразу:
        // менеджеру говорят «берём» по телефону, и заставлять его сперва
        // заводить карточку адреса значит терять факт или заводить адрес
        // наспех. Поэтому согласование проходит всегда, а заявка создаётся,
        // когда есть из чего построить маршрут. Чего не хватило — сказано
        // словами, и это видно на экране.
        if (!request.originLocationId || !request.destinationLocationId) {
            const missing = [
                !request.originLocationId ? 'погрузки' : null,
                !request.destinationLocationId ? 'выгрузки' : null,
            ].filter(Boolean).join(' и ');

            const updated = await this.prisma.quoteRequest.update({
                where: { id },
                data: {
                    status: QuoteRequestStatus.APPROVED,
                    decidedAt: new Date(),
                    rejectionReason: null,
                },
                include: QUOTE_INCLUDE,
            });

            return {
                ...updated,
                orderCreated: false,
                orderNotCreatedReason:
                    `Согласование записано, но заявка не создана: не указан адрес ${missing} ` +
                    'из справочника. Укажите его в запросе — и заявка создастся.',
            };
        }

        const order = await this.orders.create({
            // Заказчик как лицо — тот, кто оформляет; компания-заказчик
            // берётся из запроса, именно она и просила расчёт.
            customerId: userId || request.createdById || undefined as any,
            customerCompanyId: request.customerCompanyId,
            ownerCompanyId: companyId,
            responsibleManagerId: userId || request.createdById || undefined,
            routePoints: [
                {
                    locationId: request.originLocationId,
                    pointType: 'PICKUP' as const,
                    expectedDate: request.readyDate || undefined,
                },
                { locationId: request.destinationLocationId, pointType: 'DELIVERY' as const },
            ],
            cargoDescription: request.cargoDescription || undefined,
            natureOfCargo: request.natureOfCargo || undefined,
            cargoType: request.cargoType || undefined,
            cargoWeight: request.cargoWeight ?? undefined,
            cargoVolume: request.cargoVolume ?? undefined,
            palletCount: request.palletCount ?? undefined,
            // Состав груза в заявке — список строк, в запросе один вид.
            // Переносим одной строкой, чтобы карточка рейса, кабинет
            // водителя и печатные формы видели то же, что менеджер обещал
            // клиенту, а не пустой состав рядом с числом паллет.
            pallets: palletLinesFromQuote(request.palletKind, request.palletCount),
            // Согласованная сумма переносится как есть. Пересчёта здесь нет
            // и быть не должно: клиент подтвердил конкретное число.
            customerPrice: Number(request.customerPrice),
            driverCost: request.carrierCost != null ? Number(request.carrierCost) : undefined,
            requirements: request.notes || undefined,
        });

        const updated = await this.prisma.quoteRequest.update({
            where: { id },
            data: {
                status: QuoteRequestStatus.APPROVED,
                decidedAt: new Date(),
                rejectionReason: null,
                orderId: order.id,
            },
            include: QUOTE_INCLUDE,
        });

        return { ...updated, orderCreated: true, orderNotCreatedReason: null };
    }

    /**
     * Клиент отказался.
     *
     * Причина обязательна. Без неё запись бесполезна: «дорого» и «нашли
     * машину раньше» — это разные выводы, а через два дня никто уже не
     * вспомнит, что было на самом деле.
     */
    async reject(companyId: string, id: string, reason: string) {
        await this.findOne(companyId, id);

        const trimmed = reason?.trim();
        if (!trimmed) {
            throw new BadRequestException('Укажите причину отказа: без неё запись бесполезна.');
        }

        return this.prisma.quoteRequest.update({
            where: { id },
            data: {
                status: QuoteRequestStatus.REJECTED,
                rejectionReason: trimmed,
                decidedAt: new Date(),
            },
            include: QUOTE_INCLUDE,
        });
    }

    /** Вернуть запрос в работу — если решение записали ошибочно. */
    async reopen(companyId: string, id: string) {
        const request = await this.findOne(companyId, id);

        if (request.orderId) {
            throw new BadRequestException('По запросу уже оформлена заявка — вернуть его в работу нельзя.');
        }

        return this.prisma.quoteRequest.update({
            where: { id },
            data: {
                status: request.customerPrice != null ? QuoteRequestStatus.IN_PROGRESS : QuoteRequestStatus.NEW,
                rejectionReason: null,
                decidedAt: null,
            },
            include: QUOTE_INCLUDE,
        });
    }

    /**
     * Что уже возили по этому направлению.
     *
     * Считается до сохранения: менеджеру это нужно ровно в тот момент, когда
     * он назначает цену, а не после.
     *
     * Ищем по направлению всей компании, а клиент — второй разрез. Раньше
     * отбор шёл сразу по паре «карточка клиента + пара городов», и один
     * живой клиент, заведённый дважды («Шымкент пиво» и «Шымкентский
     * пивзавод»), прятал собственную историю от самого себя: менеджер видел
     * «запросов не было» при полной папке. Показываем оба разреза, но
     * порознь — чужая цена не должна выглядеть ценой этого клиента.
     */
    async memory(
        companyId: string,
        query: QuoteMemoryQuery,
    ): Promise<QuoteMemory & { others: DirectionMemory; history: any[]; annualTariff: any }> {
        const empty = {
            ...buildQuoteMemory([], {}),
            others: buildDirectionMemory([]),
            history: [] as any[],
            annualTariff: null as any,
        };

        const [origin, destination] = await Promise.all([
            this.cities.resolve(query.originCityName, query.originCityId),
            this.cities.resolve(query.destinationCityName, query.destinationCityId),
        ]);

        const originMatch = this.cityMatch('origin', origin);
        const destinationMatch = this.cityMatch('destination', destination);
        // Направление не названо — сравнивать не с чем. Пустой отбор здесь
        // означал бы «вся история компании» и увёл бы менеджера по ложному
        // следу.
        if (!originMatch || !destinationMatch) return empty;

        const where: Prisma.QuoteRequestWhereInput = {
            AND: [
                { companyId },
                originMatch,
                destinationMatch,
                ...(query.excludeId ? [{ id: { not: query.excludeId } }] : []),
            ],
        };

        // Годовой тариф ищем параллельно: если маршрут уже согласован на год,
        // считать вручную нечего, и сказать об этом надо до, а не после.
        const [history, annualTariff] = await Promise.all([
            this.prisma.quoteRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: 60,
                include: QUOTE_INCLUDE,
            }),
            // Тариф живёт на справочнике: без узнанных городов искать нечего.
            origin.id && destination.id
                ? this.contracts
                    .lookupTariffForOurClient(
                        companyId,
                        query.customerCompanyId,
                        origin.id,
                        destination.id,
                        query.cargoType,
                    )
                    .catch((e) => {
                        // Тариф — подсказка, а не условие работы: без неё запрос
                        // всё равно заводится, поэтому падать здесь нельзя.
                        this.logger.warn(`Не удалось найти годовой тариф: ${e.message}`);
                        return null;
                    })
                : null,
        ]);

        const past: PastQuote[] = history.map((h) => ({
            id: h.id,
            requestNumber: h.requestNumber,
            createdAt: h.createdAt,
            customerPrice: h.customerPrice ? Number(h.customerPrice) : null,
            carrierCost: h.carrierCost ? Number(h.carrierCost) : null,
            cargoWeight: h.cargoWeight,
            cargoVolume: h.cargoVolume,
            palletCount: h.palletCount,
            cargoType: h.cargoType,
            status: h.status,
            rejectionReason: h.rejectionReason,
            customerName: h.customerCompany?.name ?? null,
            customerCompanyId: h.customerCompanyId,
        } as PastQuote & { customerCompanyId: string }));

        const own = past.filter((p: any) => p.customerCompanyId === query.customerCompanyId);
        const others = past.filter((p: any) => p.customerCompanyId !== query.customerCompanyId);

        const memory = buildQuoteMemory(own, {
            cargoWeight: query.cargoWeight,
            cargoVolume: query.cargoVolume,
            cargoType: query.cargoType,
        });

        return {
            ...memory,
            others: buildDirectionMemory(others),
            history: history.filter((h) => h.customerCompanyId === query.customerCompanyId),
            annualTariff,
        };
    }

    /**
     * Отбор по одному концу маршрута.
     *
     * По ключу и, если город узнан, ещё и по ссылке на справочник. Второе —
     * ради запросов, заведённых до перехода на текст: ключа у них нет, а
     * ссылка есть, и терять их историю нельзя.
     */
    private cityMatch(
        side: 'origin' | 'destination',
        city: { id: string | null; key: string | null },
    ): Prisma.QuoteRequestWhereInput | null {
        const or: Prisma.QuoteRequestWhereInput[] = [];
        if (city.key) or.push({ [`${side}CityKey`]: city.key } as Prisma.QuoteRequestWhereInput);
        if (city.id) or.push({ [`${side}CityId`]: city.id } as Prisma.QuoteRequestWhereInput);
        return or.length ? { OR: or } : null;
    }

    /** Разобрать оба конца маршрута разом. */
    private resolveRoute(dto: CreateQuoteRequestData) {
        return Promise.all([
            this.cities.resolve(dto.originCityName, dto.originCityId),
            this.cities.resolve(dto.destinationCityName, dto.destinationCityId),
        ]);
    }

    /**
     * Клиент должен существовать, маршрут — быть названным.
     *
     * Городов в справочнике больше не требуем: посёлка вроде Мынарала там
     * может не быть вовсе, и запрос из-за этого не заводился. Но совсем без
     * маршрута запрос бессмысленный — по нему нечего искать и не с чем
     * сравнивать.
     */
    private async assertRouteBelongsToUs(companyId: string, dto: CreateQuoteRequestData) {
        const customer = await this.prisma.company.findUnique({
            where: { id: dto.customerCompanyId },
            select: { id: true },
        });

        if (!customer) throw new BadRequestException('Клиент не найден');
        if (!dto.originCityName?.trim() && !dto.originCityId) {
            throw new BadRequestException('Укажите город погрузки');
        }
        if (!dto.destinationCityName?.trim() && !dto.destinationCityId) {
            throw new BadRequestException('Укажите город выгрузки');
        }
        if (dto.customerCompanyId === companyId) {
            throw new BadRequestException('Запрос нельзя завести на собственную организацию');
        }
    }

    /**
     * Номер запроса. Счётчик увеличивается атомарно, как у заявок: два
     * менеджера, нажавшие «Сохранить» одновременно, не должны получить
     * один номер.
     */
    private async generateNumber(companyId: string): Promise<string> {
        await this.prisma.quoteRequestNumbering.upsert({
            where: { companyId },
            create: { companyId },
            update: {},
        });

        for (let attempt = 0; attempt < 100; attempt++) {
            const updated = await this.prisma.quoteRequestNumbering.update({
                where: { companyId },
                data: { nextNumber: { increment: 1 } },
            });
            const seq = updated.nextNumber - 1;
            const candidate = `${updated.prefix}${String(seq).padStart(updated.padding, '0')}`;
            const exists = await this.prisma.quoteRequest.findUnique({
                where: { requestNumber: candidate },
                select: { id: true },
            });
            if (!exists) return candidate;
        }

        throw new BadRequestException('Не удалось присвоить номер запросу — попробуйте ещё раз');
    }
}

/** Копирует поле, только если оно вообще пришло: пустая строка — это «очистить». */
function assignIfPresent<K extends keyof CreateQuoteRequestData>(
    dto: Partial<CreateQuoteRequestData>,
    data: Prisma.QuoteRequestUpdateInput,
    key: K,
) {
    if (dto[key] !== undefined) {
        (data as any)[key] = dto[key] || null;
    }
}

export interface CreateQuoteRequestData {
    customerCompanyId: string;
    /** Город как написали. Главное поле маршрута: справочник знает не всё. */
    originCityName?: string | null;
    /** Ссылка на справочник, если выбрали из подсказки. */
    originCityId?: string | null;
    destinationCityName?: string | null;
    destinationCityId?: string | null;
    originLocationId?: string | null;
    destinationLocationId?: string | null;
    originAddress?: string | null;
    destinationAddress?: string | null;
    readyDate?: string | null;
    cargoDescription?: string | null;
    natureOfCargo?: string | null;
    cargoType?: string | null;
    cargoWeight?: number | null;
    cargoVolume?: number | null;
    palletCount?: number | null;
    palletKind?: string | null;
    carrierCost?: number | null;
    customerPrice?: number | null;
    notes?: string | null;
}

export interface QuoteRequestsQuery extends PaginationQueryDto {
    status?: QuoteRequestStatus;
    customerCompanyId?: string;
    originCityId?: string;
    destinationCityId?: string;
    search?: string;
}

export interface QuoteMemoryQuery {
    customerCompanyId: string;
    originCityName?: string | null;
    originCityId?: string | null;
    destinationCityName?: string | null;
    destinationCityId?: string | null;
    cargoType?: string;
    cargoWeight?: number;
    cargoVolume?: number;
    excludeId?: string;
}
