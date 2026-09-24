import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { IdentityService } from '../../identity/identity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { компанииБазы, телефонДляСравнения } from '../../common/driver-pool';

@Injectable()
export class CompanyDriversService {
    constructor(private prisma: PrismaService, private identityService: IdentityService) { }

    // Фиче-флаг чтения водителей из нового слоя (Affiliation). По умолчанию ВЫКЛ, кэш 30с.
    private driverFlagCache: { value: boolean; expiresAt: number } | null = null;
    private async isAffiliationDriverReads(): Promise<boolean> {
        if (this.driverFlagCache && this.driverFlagCache.expiresAt > Date.now()) {
            return this.driverFlagCache.value;
        }
        let value = false;
        try {
            const row = await this.prisma.platformSetting.findUnique({ where: { key: 'identity_reads_drivers' } });
            value = row?.value === 'true';
        } catch {
            value = false;
        }
        this.driverFlagCache = { value, expiresAt: Date.now() + 30000 };
        return value;
    }

    private readonly driverSelect = {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        iin: true,
        vehicleType: true,
        vehiclePlate: true,
        vehicleModel: true,
        trailerNumber: true,
        docType: true,
        docNumber: true,
        docIssuedAt: true,
        docExpiresAt: true,
        docIssuedBy: true,
        createdAt: true,
    };

    /**
     * Получить список водителей компании-экспедитора или внешнего перевозчика с проверкой прав
     */
    async getDriversFiltered(myCompanyId: string, queryCompanyId?: string) {
        const targetCompanyId = queryCompanyId || myCompanyId;

        // Если запрашиваем чужих водителей (targetCompanyId != myCompanyId),
        // проверяем права: эта внешняя компания должна иметь createdByCompanyId == myCompanyId
        if (targetCompanyId !== myCompanyId) {
            const externalCompany = await this.prisma.company.findUnique({
                where: { id: targetCompanyId },
                select: { isExternal: true, createdByCompanyId: true },
            });

            if (!externalCompany) {
                throw new NotFoundException('Компания перевозчика не найдена');
            }

            if (!externalCompany.isExternal || externalCompany.createdByCompanyId !== myCompanyId) {
                throw new ForbiddenException('У вас нет доступа к водителям этой компании');
            }
        }

        // Членство водителей: всегда старое (companyId), а при флаге дополнительно
        // новый слой (Affiliation) — ОБЪЕДИНЕНИЕ, чтобы только что добавленный водитель
        // никогда не пропал.
        const membershipOr: any[] = [{ companyId: targetCompanyId }];
        if (await this.isAffiliationDriverReads()) {
            const affs = await this.prisma.affiliation.findMany({
                where: { companyId: targetCompanyId, role: UserRole.DRIVER, sourceUserId: { not: null } },
                select: { sourceUserId: true },
            });
            const affIds = Array.from(new Set(affs.map(a => a.sourceUserId).filter(Boolean))) as string[];
            if (affIds.length) membershipOr.push({ id: { in: affIds } });
        }

        return this.prisma.user.findMany({
            where: {
                role: UserRole.DRIVER,
                isActive: true,
                OR: membershipOr,
            },
            select: this.driverSelect,
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Общий список водителей компании: свои и всех её перевозчиков.
     *
     * Раньше в заявке показывались только водители выбранного ИП, и того,
     * кто вчера ехал от другого ИП, заводили заново. Теперь в списке вся база
     * (см. `компанииБазы`), а рядом с каждым — у кого прописан и от кого ездил
     * последним, чтобы экран мог поднять наверх тех, кто уже возил этого
     * перевозчика.
     *
     * Двойников — одного человека, заведённого у нескольких ИП, — показываем
     * одной строкой. Берём запись, на которую назначали последний рейс: на неё
     * пойдут и новые рейсы, и вход в приложение водителя выбирает её же (см.
     * `AuthService.loginDriver`). Остальные записи не удаляются — к ним
     * привязаны прошлые рейсы.
     *
     * В базе и нештатные водители без перевозчика (`User.baseCompanyId`): ни
     * у кого не прописаны, но заведены этой компанией. Кто есть кто — в `kind`:
     * штатный, водитель перевозчика или нештатный без перевозчика.
     */
    async getDriverPool(companyId: string) {
        const база = await компанииБазы(this.prisma, companyId);
        const водители = await this.prisma.user.findMany({
            where: {
                role: UserRole.DRIVER,
                isActive: true,
                OR: [
                    { companyId: { in: Array.from(база.keys()) } },
                    { companyId: null, baseCompanyId: companyId },
                ],
            },
            select: { ...this.driverSelect, companyId: true, updatedAt: true },
        });
        if (!водители.length) return [];

        const рейсы = await this.prisma.order.groupBy({
            by: ['driverId', 'partnerId', 'subForwarderId', 'forwarderId'],
            where: { driverId: { in: водители.map((в) => в.id) } },
            _max: { createdAt: true },
            _count: { _all: true },
        });

        // От кого ездил: перевозчик рейса из базы. Где он записан, зависит от
        // того, как заведена заявка, — перевозчиком, субподрядчиком или
        // экспедитором, — поэтому берём первого из базы по этому порядку.
        // Рейсы считаем те же — наши, а не все, что есть на платформе.
        const поездки = new Map<string, {
            перевозчики: Set<string>;
            последний: { at: Date; carrierId: string } | null;
            всего: number;
        }>();
        for (const р of рейсы) {
            if (!р.driverId) continue;
            const перевозчик = [р.partnerId, р.subForwarderId, р.forwarderId].find((id) => !!id && база.has(id));
            if (!перевозчик) continue;
            const когда = р._max.createdAt;
            const запись = поездки.get(р.driverId) ?? { перевозчики: new Set<string>(), последний: null, всего: 0 };
            запись.перевозчики.add(перевозчик);
            запись.всего += р._count._all;
            if (когда && (!запись.последний || когда > запись.последний.at)) {
                запись.последний = { at: когда, carrierId: перевозчик };
            }
            поездки.set(р.driverId, запись);
        }

        const свежесть = (в: (typeof водители)[number]) =>
            поездки.get(в.id)?.последний?.at.getTime() ?? 0;

        const группы = new Map<string, typeof водители>();
        for (const в of водители) {
            const ключ = телефонДляСравнения(в.phone) ?? `id:${в.id}`;
            группы.set(ключ, [...(группы.get(ключ) ?? []), в]);
        }

        const список = Array.from(группы.values()).map((записи) => {
            const [главная] = [...записи].sort((а, б) =>
                (свежесть(б) - свежесть(а)) || (б.updatedAt.getTime() - а.updatedAt.getTime()));
            const перевозчики = new Set<string>();
            let последний: { at: Date; carrierId: string } | null = null;
            let всегоРейсов = 0;
            for (const з of записи) {
                if (з.companyId) перевозчики.add(з.companyId);
                const п = поездки.get(з.id);
                п?.перевозчики.forEach((id) => перевозчики.add(id));
                всегоРейсов += п?.всего ?? 0;
                if (п?.последний && (!последний || п.последний.at > последний.at)) последний = п.последний;
            }
            const { updatedAt: _обновлён, ...водитель } = главная;
            const kind: 'STAFF' | 'CARRIER' | 'INDEPENDENT' = !главная.companyId
                ? 'INDEPENDENT'
                : главная.companyId === companyId ? 'STAFF' : 'CARRIER';
            return {
                ...водитель,
                companyName: главная.companyId ? база.get(главная.companyId) ?? null : null,
                isStaff: kind === 'STAFF',
                kind,
                tripsCount: всегоРейсов,
                carrierIds: Array.from(перевозчики),
                lastTrip: последний
                    ? { at: последний.at, carrierId: последний.carrierId, carrierName: база.get(последний.carrierId) ?? null }
                    : null,
            };
        });

        return список.sort((а, б) =>
            ((б.lastTrip?.at.getTime() ?? 0) - (а.lastTrip?.at.getTime() ?? 0))
            || `${а.lastName} ${а.firstName}`.localeCompare(`${б.lastName} ${б.firstName}`, 'ru'));
    }

    /**
     * Создать водителя для компании-экспедитора
     */
    async createDriver(companyId: string, data: {
        firstName: string;
        lastName: string;
        middleName?: string;
        phone: string;
        password?: string;
        iin?: string;
        vehicleType?: string;
        vehiclePlate?: string;
        vehicleModel?: string;
        trailerNumber?: string;
        docType?: string;
        docNumber?: string;
        docIssuedAt?: Date;
        docExpiresAt?: Date;
        docIssuedBy?: string;
    }, requesterCompanyId?: string) {
        // Создавать водителей можно только в своей компании или у своего внешнего перевозчика
        if (requesterCompanyId && companyId !== requesterCompanyId) {
            const targetCompany = await this.prisma.company.findUnique({
                where: { id: companyId },
                select: { isExternal: true, createdByCompanyId: true },
            });

            if (!targetCompany) {
                throw new NotFoundException('Компания перевозчика не найдена');
            }

            if (!targetCompany.isExternal || targetCompany.createdByCompanyId !== requesterCompanyId) {
                throw new ForbiddenException('У вас нет доступа к водителям этой компании');
            }
        }

        // Пароль для мобильного приложения хранится только в виде хеша
        const { password, ...driverData } = data;
        const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

        const existing = await this.findTwin(companyId, data.phone, data.iin, requesterCompanyId);

        if (existing) {
            return this.обновитьДвойника(existing, companyId, driverData, passwordHash);
        }

        // Автоматически создаем отдел "Водители" при регистрации водителя, если его нет
        let driversDept = await this.prisma.department.findFirst({
            where: { companyId, name: 'Водители' }
        });

        if (!driversDept) {
            driversDept = await this.prisma.department.create({
                data: {
                    name: 'Водители',
                    companyId,
                    icon: 'TruckOutlined'
                }
            });
        }

        // Создаём водителя
        const created = await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    ...driverData,
                    ...(passwordHash ? { passwordHash } : {}),
                    role: UserRole.DRIVER,
                    companyId,
                    departmentId: driversDept.id,
                    isActive: true,
                },
                select: this.driverSelect,
            });

            await tx.userCompanyRelation.create({
                data: {
                    userId: user.id,
                    companyId,
                    role: UserRole.DRIVER,
                },
            });

            return user;
        });

        // Двойная запись в новый слой (не должна ломать основную операцию)
        try {
            await this.identityService.syncMembership(created.id, companyId, UserRole.DRIVER, { isPrimary: true });
        } catch (e) {
            console.warn('syncMembership (driver create) failed:', e);
        }

        return created;
    }

    /**
     * Нештатный водитель без перевозчика: человек со своей машиной, у которого
     * нет ИП.
     *
     * Экспедитор нашёл его на рейс, данные и машину записал, а сделку ведёт
     * через своего перевозчика. Прописать такого водителя не у кого, поэтому он
     * числится в базе компании (`baseCompanyId`), а не у неё в штате: ни в
     * «Сотрудниках», ни в отделе «Водители», ни в зарплате его нет. В заявке он
     * ставится на рейс любого перевозчика базы — как все водители базы.
     *
     * Двойника ищем по всей базе, как у водителей перевозчиков: если человек
     * уже есть — хоть у ИП, хоть нештатным, — второго не заводим.
     */
    async createIndependentDriver(requesterCompanyId: string, data: {
        firstName: string;
        lastName: string;
        middleName?: string;
        phone: string;
        password?: string;
        iin?: string;
        vehicleType?: string;
        vehiclePlate?: string;
        vehicleModel?: string;
        trailerNumber?: string;
        docType?: string;
        docNumber?: string;
        docIssuedAt?: Date;
        docExpiresAt?: Date;
        docIssuedBy?: string;
    }) {
        const { password, ...driverData } = data;
        const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

        const existing = await this.findTwin(null, data.phone, data.iin, requesterCompanyId);
        if (existing) {
            return this.обновитьДвойника(existing, null, driverData, passwordHash);
        }

        const created = await this.prisma.user.create({
            data: {
                ...driverData,
                ...(passwordHash ? { passwordHash } : {}),
                role: UserRole.DRIVER,
                companyId: null,
                baseCompanyId: requesterCompanyId,
                isActive: true,
            },
            select: this.driverSelect,
        });

        // Личность в новом слое — без членства в компании: в старом слое его
        // нет ни у кого (`companyId` пуст), и сверка слоёв должна сходиться.
        try {
            await this.identityService.ensurePerson(created.id);
        } catch (e) {
            console.warn('ensurePerson (independent driver) failed:', e);
        }

        return created;
    }

    /**
     * Тот же человек уже в базе: второго не заводим, а данные обновляем тем,
     * что сейчас ввели, — это самое свежее, что о нём известно.
     *
     * Если он прописан у другого перевозчика или у самой компании, прописку
     * не трогаем: у кого завели, у того и числится. Назначить его можно на рейс
     * любого перевозчика базы — тот же водитель сегодня едет от одного ИП,
     * завтра от другого.
     *
     * Телефон не переписываем, если нашли именно по нему: это вход водителя в
     * приложение, а приложение сравнивает номер строкой. Совпал он лишь с
     * точностью до записи — «8 701…» вместо «+7 701…», — и переписать значило
     * бы запереть водителя снаружи.
     */
    private async обновитьДвойника(
        existing: { id: string; companyId: string | null; поТелефону: boolean },
        companyId: string | null,
        driverData: Record<string, any>,
        passwordHash?: string,
    ) {
        const { phone: _набранныйТелефон, ...безТелефона } = driverData;
        const updated = await this.prisma.user.update({
            where: { id: existing.id },
            data: {
                ...(existing.поТелефону ? безТелефона : driverData),
                ...(passwordHash ? { passwordHash } : {}),
                isActive: true,
            },
            select: this.driverSelect,
        });

        // Двойная запись в новый слой — только для своей прописки. Связь с
        // другим перевозчиком туда не пишем: сверка нового слоя со старым
        // (`IdentityService.reconcileReads`) приняла бы её за расхождение.
        if (companyId && existing.companyId === companyId) {
            try {
                await this.identityService.syncMembership(existing.id, companyId, UserRole.DRIVER, { isPrimary: true });
            } catch (e) {
                console.warn('syncMembership (driver update) failed:', e);
            }
        }

        // У кого он прописан — чтобы экран сказал прямо: «уже есть в базе,
        // у ИП Сериков». Иначе человек добавляет водителя в карточке
        // перевозчика, видит «использован существующий» и не находит его
        // в списке этого перевозчика.
        const прописан = existing.companyId && existing.companyId !== companyId
            ? await this.prisma.company.findUnique({ where: { id: existing.companyId }, select: { name: true } })
            : null;

        return {
            ...updated,
            alreadyExists: true,
            sharedFromName: прописан?.name ?? null,
        };
    }

    /**
     * Тот же человек, уже заведённый в базе: совпал телефон или ИИН.
     *
     * Раньше искали только у того перевозчика, под которым заводят, и точным
     * совпадением строки телефона. Водителя, которого вчера завели под другим
     * ИП, заводили второй раз, а «8 700…» и «+7 700…» считались разными
     * номерами.
     *
     * Сначала — у этого же перевозчика (так было всегда), потом — во всей базе
     * компании. Уволенных (снятых) тоже находим: вернуть человека лучше, чем
     * завести ему двойника. Из нескольких записей одного человека — та, на
     * которую назначали последний рейс, как в общем списке.
     *
     * Штатного водителя (заводят в саму компанию) ищем, как раньше, только
     * среди штатных. Штатный — это отдел, зарплата, список сотрудников; если
     * человек, ездивший от ИП, переходит в штат, ему нужна своя запись, а не
     * запись перевозчика, которой в списке сотрудников нет.
     *
     * `companyId` пуст — заводят нештатного водителя без перевозчика: ищем
     * по всей базе, и среди её нештатных тоже.
     */
    private async findTwin(
        companyId: string | null,
        phone: string,
        iin: string | undefined,
        requesterCompanyId?: string,
    ) {
        const вШтат = !!companyId && (!requesterCompanyId || companyId === requesterCompanyId);
        const компании = вШтат || !requesterCompanyId
            ? []
            : Array.from((await компанииБазы(this.prisma, requesterCompanyId)).keys());
        if (companyId && !компании.includes(companyId)) компании.push(companyId);

        const где: any = вШтат || !requesterCompanyId
            ? { role: UserRole.DRIVER, companyId: { in: компании } }
            : {
                role: UserRole.DRIVER,
                OR: [
                    { companyId: { in: компании } },
                    { companyId: null, baseCompanyId: requesterCompanyId },
                ],
            };
        const кандидаты = await this.prisma.user.findMany({
            where: где,
            select: { id: true, companyId: true, phone: true, iin: true, isActive: true, updatedAt: true },
        });
        const телефон = телефонДляСравнения(phone);
        const совпали = кандидаты
            .map((к) => ({ ...к, поТелефону: !!телефон && телефонДляСравнения(к.phone) === телефон }))
            .filter((к) => к.поТелефону || (!!iin && к.iin === iin));
        if (!совпали.length) return null;

        const рейсы = await this.prisma.order.groupBy({
            by: ['driverId'],
            where: { driverId: { in: совпали.map((с) => с.id) } },
            _max: { createdAt: true },
        });
        const последнийРейс = new Map(рейсы.map((р) => [р.driverId, р._max.createdAt?.getTime() ?? 0]));

        return [...совпали].sort((а, б) =>
            (Number(б.companyId === companyId) - Number(а.companyId === companyId))
            || (Number(б.isActive) - Number(а.isActive))
            || ((последнийРейс.get(б.id) ?? 0) - (последнийРейс.get(а.id) ?? 0))
            || (б.updatedAt.getTime() - а.updatedAt.getTime()))[0];
    }

    /**
     * Водитель из базы этой компании: её штатный, водитель её перевозчика или
     * её нештатный без перевозчика. Править и убирать из списка можно только
     * таких — чужих водителей платформы нельзя.
     */
    private async водительВБазе(
        driver: { companyId: string | null; baseCompanyId?: string | null },
        companyId: string,
    ): Promise<boolean> {
        if (driver.companyId === companyId) return true;
        if (!driver.companyId) return !!driver.baseCompanyId && driver.baseCompanyId === companyId;
        const driverCompany = await this.prisma.company.findUnique({
            where: { id: driver.companyId },
            select: { isExternal: true, createdByCompanyId: true },
        });
        return !!driverCompany?.isExternal && driverCompany.createdByCompanyId === companyId;
    }

    /**
     * Обновить данные водителя
     */
    async updateDriver(
        driverId: string,
        companyId: string,
        data: {
            password?: string;
            firstName?: string;
            lastName?: string;
            middleName?: string;
            phone?: string;
            iin?: string;
            vehicleType?: string;
            vehiclePlate?: string;
            vehicleModel?: string;
            trailerNumber?: string;
            docType?: string;
            docNumber?: string;
            docIssuedAt?: Date;
            docExpiresAt?: Date;
            docIssuedBy?: string;
        }
    ) {
        // Проверяем что водитель принадлежит компании или её внешнему перевозчику
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
        });
 
        if (!driver) {
            throw new NotFoundException('Водитель не найден');
        }
 
        if (!(await this.водительВБазе(driver, companyId))) {
            throw new ForbiddenException('У вас нет доступа к этому водителю');
        }

        // Телефон водителя — это его вход в мобильное приложение. Два водителя
        // с одинаковым номером сделали бы вход неоднозначным, поэтому меняем
        // только на свободный и говорим прямо, если номер занят.
        if (data.phone && data.phone !== driver.phone) {
            const taken = await this.prisma.user.findFirst({
                where: { phone: data.phone, id: { not: driverId }, isActive: true },
                select: { id: true },
            });
            if (taken) {
                throw new BadRequestException('Этот номер телефона уже занят другим сотрудником');
            }
        }

        const { password, ...updateData } = data;
        const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

        return this.prisma.user.update({
            where: { id: driverId },
            data: {
                ...updateData,
                ...(passwordHash ? { passwordHash } : {}),
            },
            select: this.driverSelect,
        });
    }
 
    /**
     * Деактивировать водителя
     */
    async deactivateDriver(driverId: string, companyId: string) {
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
        });
 
        if (!driver) {
            throw new NotFoundException('Водитель не найден');
        }
 
        if (!(await this.водительВБазе(driver, companyId))) {
            throw new ForbiddenException('У вас нет доступа к этому водителю');
        }
 
        return this.prisma.user.update({
            where: { id: driverId },
            data: { isActive: false },
        });
    }
}
