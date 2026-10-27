import { ApiProperty } from '@nestjs/swagger';
import { ExchangeDriverDocumentKind, ExchangeDriverKind, ExchangeDriverStatus } from '@prisma/client';
import {
    ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from '../../auth/password-policy';

/** Парк сам заводит водителя: имя и номер, пароль придумает система (Q3/R1). */
export class AddParkDriverDto {
    @ApiProperty({ example: '+77011234567' })
    @IsString()
    @IsNotEmpty({ message: 'Укажите телефон водителя' })
    @MaxLength(30)
    phone: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Укажите фамилию' })
    @MaxLength(100)
    lastName: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Укажите имя' })
    @MaxLength(100)
    firstName: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    middleName?: string;
}

/**
 * Регистрация водителя биржи по номеру и паролю. Пока без СМС — см.
 * `ExchangeDriversService.registerByPhone`.
 */
export class DriverPhoneRegisterDto {
    @ApiProperty({ example: '+77011234567' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    phone: string;

    @ApiProperty()
    @IsString()
    @MinLength(MIN_PASSWORD_LENGTH, { message: PASSWORD_TOO_SHORT })
    @MaxLength(100)
    password: string;

    @ApiProperty({ required: false, enum: ['PARK', 'IP'] })
    @IsOptional()
    @IsIn(['PARK', 'IP'])
    kind?: 'PARK' | 'IP';

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    deviceId: string;
}

/** Вход водителя через Google: токен от Google и устройство (одна сессия на человека). */
export class DriverGoogleAuthDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    token: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    deviceId: string;
}

/**
 * Анкета водителя. Поля перечислены руками — всё, чего здесь нет, сервер
 * не примет (дыра «тело целиком в базу», HANDOFF 29.09).
 */
export class UpdateDriverProfileDto {
    @ApiProperty({ required: false, enum: ExchangeDriverKind })
    @IsEnum(ExchangeDriverKind, { message: 'Выберите: свой ИП или через парк' })
    @IsOptional()
    kind?: ExchangeDriverKind;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    parkCompanyId?: string;

    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(80) lastName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(80) firstName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(80) middleName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) iin?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(30) phone?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(200) ipName?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) ipIin?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) vehiclePlate?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(60) vehicleBodyType?: string;

    @ApiProperty({ required: false, description: 'Грузоподъёмность, кг' })
    @IsInt({ message: 'Грузоподъёмность — целое число' })
    @Min(100)
    @Max(100000)
    @IsOptional()
    vehicleCapacityKg?: number;

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    vehicleIsOwn?: boolean;

    /** Удостоверение личности: номер — девять цифр, даты — «ГГГГ-ММ-ДД». */
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(20) idNumber?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(120) idIssuedBy?: string;
    @ApiProperty({ required: false, description: 'ГГГГ-ММ-ДД; пустая строка — стереть' }) @IsString() @IsOptional() @MaxLength(10) idIssuedAt?: string;
    @ApiProperty({ required: false, description: 'ГГГГ-ММ-ДД; пустая строка — стереть' }) @IsString() @IsOptional() @MaxLength(10) idExpiresAt?: string;

    /** Для договора с парком: адрес прописки, марка и модель машины, номер техпаспорта. */
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(300) registrationAddress?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(100) vehicleModel?: string;
    @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(30) vehicleRegNumber?: string;

    /** Согласие на обработку персональных данных: да — запомнить время и версию текста, нет — отозвать. */
    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    consent?: boolean;
}

export class DriverDocumentDto {
    @ApiProperty({ enum: ExchangeDriverDocumentKind })
    @IsEnum(ExchangeDriverDocumentKind, { message: 'Неизвестный вид документа' })
    kind: ExchangeDriverDocumentKind;
}

export class DriverReasonDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Напишите причину' })
    @MaxLength(300)
    reason: string;
}

export class DriverFeedQueryDto {
    @ApiProperty({ required: false, description: 'Тип кузова — только такие заявки' })
    @IsString()
    @IsOptional()
    @MaxLength(60)
    bodyType?: string;
}

/** Код приглашения парка — шесть знаков, как в ссылке. */
export class ParkCodeDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Впишите код парка' })
    @MaxLength(12)
    code: string;
}

/** Счёт водителя для выплат через парк. */
export class PayoutAccountDto {
    @ApiProperty({ description: 'IBAN, KZ… — 20 знаков' })
    @IsString()
    @IsNotEmpty({ message: 'Впишите IBAN' })
    @MaxLength(40)
    iban: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    bank?: string;
}

/** Ставки удержаний парка, %. */
export class PayoutRatesDto {
    @ApiProperty() @IsNumber({}, { message: 'Комиссия — числом' }) @Min(0) @Max(100) commissionPct: number;
    @ApiProperty() @IsNumber({}, { message: 'ОПВ — числом' }) @Min(0) @Max(100) opvPct: number;
    @ApiProperty() @IsNumber({}, { message: 'ВОСМС — числом' }) @Min(0) @Max(100) vosmsPct: number;
    @ApiProperty() @IsNumber({}, { message: 'ИПН — числом' }) @Min(0) @Max(100) ipnPct: number;
    @ApiProperty() @IsNumber({}, { message: 'СО — числом' }) @Min(0) @Max(100) soPct: number;

    // Расчёт «на руки» (12.10.2026). Необязательные: старый кабинет их не шлёт.
    @ApiProperty({ required: false, description: 'Топливо на 1 км, ₸ — оценка для цены заранее' })
    @IsOptional() @IsNumber({}, { message: 'Топливо на км — числом' }) @Min(0) @Max(10000) fuelPerKm?: number;

    @ApiProperty({ required: false, description: 'Стандартный вычет по ИПН водителю — раз в месяц' })
    @IsOptional() @IsBoolean() applyDeduction?: boolean;

    @ApiProperty({ required: false, description: 'Вычет, МРП' })
    @IsOptional() @IsInt({ message: 'Вычет — целым числом МРП' }) @Min(0) @Max(1000) deductionMrp?: number;

    @ApiProperty({ required: false, description: 'МРП, ₸' })
    @IsOptional() @IsInt({ message: 'МРП — целым числом тенге' }) @Min(1) @Max(1000000) mrp?: number;

    // НДС (15.10.2026): прибавляется к цене для компании, только у плательщиков НДС.
    @ApiProperty({ required: false, description: 'Парк — плательщик НДС' })
    @IsOptional() @IsBoolean() vatPayer?: boolean;

    @ApiProperty({ required: false, description: 'Ставка НДС, %' })
    @IsOptional() @IsNumber({}, { message: 'НДС — числом' }) @Min(0) @Max(100) vatPct?: number;

    // Топливо и прогрессивный ИПН — схема шефа (16.10.2026).
    @ApiProperty({ required: false, description: 'Расход топлива, л на 100 км' })
    @IsOptional() @IsNumber({}, { message: 'Расход — числом' }) @Min(0) @Max(200) fuelConsumption?: number;

    @ApiProperty({ required: false, description: 'Цена литра летом, ₸' })
    @IsOptional() @IsNumber({}, { message: 'Цена литра — числом' }) @Min(0) @Max(100000) fuelPriceSummer?: number;

    @ApiProperty({ required: false, nullable: true, description: 'Цена литра зимой, ₸; пусто — как летом' })
    @IsOptional() @IsNumber({}, { message: 'Цена литра — числом' }) @Min(0) @Max(100000) fuelPriceWinter?: number | null;

    @ApiProperty({ required: false, enum: ['SUMMER', 'WINTER'] })
    @IsOptional() @IsIn(['SUMMER', 'WINTER'], { message: 'Сезон — лето или зима' }) fuelSeason?: string;

    @ApiProperty({ required: false, description: 'Повышенная ставка ИПН, %' })
    @IsOptional() @IsNumber({}, { message: 'Ставка ИПН — числом' }) @Min(0) @Max(100) ipnHighPct?: number;

    @ApiProperty({ required: false, description: 'Порог годового дохода для повышенной ставки, МРП' })
    @IsOptional() @IsInt({ message: 'Порог — целым числом МРП' }) @Min(0) @Max(1000000) ipnThresholdMrp?: number;
    /** Сколько от суммы за рейс водитель может попросить заранее, % (Q17). */
    @ApiProperty({ required: false })
    @IsOptional() @IsInt({ message: 'Доля — целым числом процентов' }) @Min(0) @Max(100) advanceLimitPct?: number;
}

export class FuelSeasonDto {
    @ApiProperty({ enum: ['SUMMER', 'WINTER'] })
    @IsIn(['SUMMER', 'WINTER'], { message: 'Сезон — лето или зима' }) season: string;
}

export class DeductionRequestDto {
    @ApiProperty({ description: 'true — прошу применять базовый вычет; у другого работодателя не получаю' })
    @IsBoolean() requested: boolean;
}

/** Тягач или прицеп в «Транспорт» водителя (R4). */
export class DriverVehicleDto {
    @ApiProperty({ enum: ['TRACTOR', 'TRAILER'] })
    @IsIn(['TRACTOR', 'TRAILER'], { message: 'Выберите: тягач или прицеп' })
    kind: 'TRACTOR' | 'TRAILER';

    @ApiProperty({ example: '123ABC02' })
    @IsString() @IsNotEmpty({ message: 'Впишите госномер' }) @MaxLength(20)
    plate: string;

    @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) model?: string;
    @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(50) bodyType?: string;
    @ApiProperty({ required: false, description: 'Грузоподъёмность, кг' })
    @IsOptional() @IsInt({ message: 'Грузоподъёмность — целым числом, кг' }) @Min(1) @Max(100000) capacityKg?: number;
    @ApiProperty({ required: false, description: 'Номер техпаспорта' }) @IsOptional() @IsString() @MaxLength(30) regNumber?: string;
    @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isOwn?: boolean;
}

/** Ещё номера и контакты для документов (Q6) — меняются без повторной проверки. */
export class DriverContactsDto {
    @ApiProperty({ type: [String], required: false, description: 'До трёх номеров: второй, третий, зарубежный' })
    @IsOptional() @IsArray() @ArrayMaxSize(3, { message: 'Дополнительных номеров — не больше трёх' })
    @IsString({ each: true }) @MaxLength(30, { each: true })
    extraPhones?: string[];

    @ApiProperty({ required: false, description: 'Почта для бухгалтерских документов' })
    @IsOptional() @IsString() @MaxLength(120)
    docsEmail?: string | null;

    @ApiProperty({ required: false, description: 'Кто по документам: имя и телефон' })
    @IsOptional() @IsString() @MaxLength(200)
    docsContact?: string | null;
}

export class DeletionRequestDto {
    @ApiProperty({ required: false })
    @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ConfirmRatesDto {
    @ApiProperty({ description: 'true — бухгалтер подтвердил расчёт; false — снять подтверждение' })
    @IsBoolean() confirmed: boolean;
}

/** Согласие продолжить по предварительному расчёту (ставки не подтверждены бухгалтером). */
export class PreliminaryAckDto {
    @ApiProperty({ required: false })
    @IsOptional() @IsBoolean() preliminaryAck?: boolean;
}

export class ExportPayoutsDto {
    @ApiProperty({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    ids: string[];

    @ApiProperty({ required: false, description: 'Согласие выгрузить по предварительному расчёту' })
    @IsOptional() @IsBoolean() preliminaryAck?: boolean;
}

export const PAYOUT_FILTERS = ['REQUESTED', 'EXPORTED', 'PAID', 'REJECTED', 'all'] as const;

export class ParkPayoutsQueryDto {
    @ApiProperty({ required: false, enum: PAYOUT_FILTERS })
    @IsIn(PAYOUT_FILTERS as unknown as string[])
    @IsOptional()
    status?: typeof PAYOUT_FILTERS[number];
}

export const PARK_TRIP_FILTERS = ['active', 'done', 'all'] as const;

export class ParkTripsQueryDto {
    @ApiProperty({ required: false, enum: PARK_TRIP_FILTERS })
    @IsIn(PARK_TRIP_FILTERS as unknown as string[])
    @IsOptional()
    status?: typeof PARK_TRIP_FILTERS[number];
}

/** `draft` — анкета ещё не отправлена: водитель вошёл по коду или его добавил сам парк (Q3). */
export const PARK_DRIVER_FILTERS = ['pending', 'approved', 'rejected', 'blocked', 'all', 'draft'] as const;
export type ParkDriverFilter = typeof PARK_DRIVER_FILTERS[number];

export class ParkDriversQueryDto {
    @ApiProperty({ required: false, enum: PARK_DRIVER_FILTERS })
    @IsIn(PARK_DRIVER_FILTERS as unknown as string[])
    @IsOptional()
    status?: ParkDriverFilter;
}

export class AdminCompaniesQueryDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    q?: string;
}

export class SetParkDto {
    @ApiProperty()
    @IsBoolean()
    isPark: boolean;
}

export class SetExchangeAccessDto {
    @ApiProperty()
    @IsBoolean()
    exchangeAccess: boolean;
}

export const PARK_FILTER_STATUSES: Record<ParkDriverFilter, ExchangeDriverStatus[] | undefined> = {
    pending: ['PENDING'],
    approved: ['APPROVED'],
    rejected: ['REJECTED'],
    blocked: ['BLOCKED'],
    all: ['PENDING', 'APPROVED', 'REJECTED', 'BLOCKED'],
    draft: ['DRAFT'],
};

/** Заработок LogiCore по паркам — период «ГГГГ-ММ-ДД», оба края включительно. */
export class ParkEarningsQueryDto {
    @ApiProperty({ required: false, example: '2026-10-01' })
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата периода — в виде ГГГГ-ММ-ДД' })
    from?: string;

    @ApiProperty({ required: false, example: '2026-10-31' })
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата периода — в виде ГГГГ-ММ-ДД' })
    to?: string;
}
