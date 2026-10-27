import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlate } from './driver-identity';

export const VEHICLE_KINDS = ['TRACTOR', 'TRAILER'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

/** Рейс идёт — машину не меняем: заказчик видит её в рейсе. */
const ACTIVE_TRIP = ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'PROBLEM'] as const;

const VEHICLE_SELECT = {
    id: true, kind: true, plate: true, model: true, bodyType: true, capacityKg: true, regNumber: true, isOwn: true, isMain: true, createdAt: true,
} satisfies Prisma.ExchangeDriverVehicleSelect;

export interface VehicleInput {
    kind: string;
    plate: string;
    model?: string | null;
    bodyType?: string | null;
    capacityKg?: number | null;
    regNumber?: string | null;
    isOwn?: boolean;
}

/**
 * Транспорт водителя биржи (задачи шефа, R4): несколько тягачей и прицепов,
 * один из каждых — основной.
 *
 * Основной тягач — машина из анкеты: её проверяет парк, она названа в
 * договоре с парком, её видят компании в откликах. Поэтому запись здесь
 * держится с анкетой заодно, а смена основного тягача идёт тем же путём,
 * что смена машины в анкете: у водителя с ИП — сразу; у водителя парка
 * анкета возвращается на правку — договор с парком подписывается заново и
 * парк проверяет её снова.
 *
 * Основной прицеп ни в анкете, ни в договоре не значится — его меняют
 * когда угодно; он уходит в рейс, когда компания выбирает водителя.
 */
@Injectable()
export class ExchangeDriverVehiclesService {
    constructor(private readonly prisma: PrismaService) {}

    private async driverOf(userId: string) {
        const driver = await this.prisma.exchangeDriver.findUnique({
            where: { userId },
            select: {
                id: true, userId: true, kind: true, status: true,
                vehiclePlate: true, vehicleModel: true, vehicleBodyType: true, vehicleCapacityKg: true, vehicleRegNumber: true, vehicleIsOwn: true,
            },
        });
        if (!driver) throw new NotFoundException('Анкета не найдена — откройте приложение заново');
        if (driver.status === 'BLOCKED') throw new ForbiddenException('Вы заблокированы на бирже');
        return driver;
    }

    private activeTrips(userId: string) {
        return this.prisma.order.count({ where: { driverId: userId, status: { in: [...ACTIVE_TRIP] } } });
    }

    /** Основной тягач — машина из анкеты: подтягиваем запись к ней. */
    private async syncMainTractor(driver: Awaited<ReturnType<ExchangeDriverVehiclesService['driverOf']>>) {
        if (!driver.vehiclePlate) return;
        const plate = normalizePlate(driver.vehiclePlate);
        const fields = {
            model: driver.vehicleModel, bodyType: driver.vehicleBodyType, capacityKg: driver.vehicleCapacityKg,
            regNumber: driver.vehicleRegNumber, isOwn: driver.vehicleIsOwn, isMain: true,
        };
        await this.prisma.$transaction([
            this.prisma.exchangeDriverVehicle.updateMany({
                where: { driverId: driver.id, kind: 'TRACTOR', isMain: true, plate: { not: plate } },
                data: { isMain: false },
            }),
            this.prisma.exchangeDriverVehicle.upsert({
                where: { driverId_kind_plate: { driverId: driver.id, kind: 'TRACTOR', plate } },
                create: { driverId: driver.id, kind: 'TRACTOR', plate, ...fields },
                update: fields,
            }),
        ]);
    }

    async list(userId: string) {
        const driver = await this.driverOf(userId);
        await this.syncMainTractor(driver);
        const rows = await this.prisma.exchangeDriverVehicle.findMany({
            where: { driverId: driver.id },
            select: VEHICLE_SELECT,
            orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
        });
        return {
            kind: driver.kind,
            /** Сейчас рейс — основной тягач не сменить. */
            onTrip: (await this.activeTrips(driver.userId)) > 0,
            tractors: rows.filter((v) => v.kind === 'TRACTOR'),
            trailers: rows.filter((v) => v.kind === 'TRAILER'),
        };
    }

    async add(userId: string, dto: VehicleInput) {
        const driver = await this.driverOf(userId);
        if (!VEHICLE_KINDS.includes(dto.kind as VehicleKind)) throw new BadRequestException('Выберите: тягач или прицеп');
        const plate = normalizePlate(dto.plate);
        if (plate.length < 4) throw new BadRequestException('Впишите госномер');
        // Машину, на которой обманули, биржа не пускает ни у кого.
        const blocked = await this.prisma.exchangeBlocklist.findFirst({ where: { kind: 'PLATE', value: plate }, select: { id: true } });
        if (blocked) throw new ForbiddenException('Эта машина в чёрном списке биржи — добавить её нельзя');
        const capacityKg = dto.capacityKg == null ? null : Math.round(dto.capacityKg);
        if (capacityKg != null && (capacityKg <= 0 || capacityKg > 100_000)) throw new BadRequestException('Грузоподъёмность — от 1 до 100 000 кг');

        // Первый прицеп сразу основной: выбирать пока не из чего.
        const firstTrailer = dto.kind === 'TRAILER'
            && !(await this.prisma.exchangeDriverVehicle.count({ where: { driverId: driver.id, kind: 'TRAILER' } }));
        try {
            await this.prisma.exchangeDriverVehicle.create({
                data: {
                    driverId: driver.id, kind: dto.kind, plate,
                    model: dto.model?.trim() || null, bodyType: dto.bodyType?.trim() || null, capacityKg,
                    regNumber: dto.regNumber?.trim() || null, isOwn: dto.isOwn ?? true, isMain: firstTrailer,
                },
            });
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException(`${dto.kind === 'TRAILER' ? 'Прицеп' : 'Тягач'} ${plate} уже есть в списке`);
            }
            throw e;
        }
        return this.list(userId);
    }

    private async ownVehicle(driverId: string, id: string) {
        const vehicle = await this.prisma.exchangeDriverVehicle.findFirst({ where: { id, driverId }, select: VEHICLE_SELECT });
        if (!vehicle) throw new NotFoundException('Машина не найдена');
        return vehicle;
    }

    async remove(userId: string, id: string) {
        const driver = await this.driverOf(userId);
        const vehicle = await this.ownVehicle(driver.id, id);
        if (vehicle.kind === 'TRACTOR' && vehicle.isMain) {
            throw new BadRequestException('Основной тягач — машина из анкеты. Сначала сделайте основным другой');
        }
        await this.prisma.exchangeDriverVehicle.delete({ where: { id } });
        return this.list(userId);
    }

    /**
     * Сделать основным. Ответ говорит, ушла ли анкета на проверку: тогда
     * приложение ведёт водителя подписать договор и отправить анкету.
     */
    async makeMain(userId: string, id: string) {
        const driver = await this.driverOf(userId);
        const vehicle = await this.ownVehicle(driver.id, id);
        if (vehicle.isMain) return { ...(await this.list(userId)), needsReview: false };

        if (vehicle.kind === 'TRAILER') {
            await this.prisma.$transaction([
                this.prisma.exchangeDriverVehicle.updateMany({ where: { driverId: driver.id, kind: 'TRAILER' }, data: { isMain: false } }),
                this.prisma.exchangeDriverVehicle.update({ where: { id }, data: { isMain: true } }),
            ]);
            return { ...(await this.list(userId)), needsReview: false };
        }

        if (await this.activeTrips(driver.userId)) {
            throw new BadRequestException('Сначала довезите текущий груз — во время рейса машину не меняют');
        }
        if (driver.status === 'PENDING') throw new BadRequestException('Анкета на проверке у парка — дождитесь решения');

        // Машина из анкеты — та, что станет основной.
        const anketa: Prisma.ExchangeDriverUpdateInput = {
            vehiclePlate: vehicle.plate, vehicleModel: vehicle.model, vehicleBodyType: vehicle.bodyType,
            vehicleCapacityKg: vehicle.capacityKg, vehicleRegNumber: vehicle.regNumber, vehicleIsOwn: vehicle.isOwn,
        };
        // Водитель парка: машина названа в договоре с парком и её проверяет
        // парк — договор подписывается заново, анкета снова на проверку.
        const needsReview = driver.kind === 'PARK';
        const review: Prisma.ExchangeDriverUpdateInput = needsReview
            ? {
                contractSignedAt: null, contractSignedDevice: null, contractSignedIp: null,
                ...(driver.status === 'APPROVED' ? { status: 'DRAFT', reviewedAt: null, reviewedById: null } : {}),
            }
            : {};
        await this.prisma.$transaction([
            this.prisma.exchangeDriverVehicle.updateMany({ where: { driverId: driver.id, kind: 'TRACTOR' }, data: { isMain: false } }),
            this.prisma.exchangeDriverVehicle.update({ where: { id }, data: { isMain: true } }),
            this.prisma.exchangeDriver.update({ where: { id: driver.id }, data: { ...anketa, ...review } }),
        ]);
        return { ...(await this.list(userId)), needsReview };
    }

    /** Парку — весь транспорт водителя в карточке. */
    async forPark(parkId: string, driverId: string) {
        const driver = await this.prisma.exchangeDriver.findFirst({ where: { id: driverId, parkCompanyId: parkId }, select: { id: true } });
        if (!driver) throw new NotFoundException('Водитель не найден');
        return this.prisma.exchangeDriverVehicle.findMany({
            where: { driverId },
            select: VEHICLE_SELECT,
            orderBy: [{ kind: 'asc' }, { isMain: 'desc' }, { createdAt: 'asc' }],
        });
    }
}
