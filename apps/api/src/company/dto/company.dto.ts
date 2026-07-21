import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional, IsIn, IsBoolean, IsArray } from 'class-validator';
import { UserRole } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class GetCompanyUsersQueryDto extends PaginationQueryDto {
    @ApiProperty({ required: false, enum: UserRole })
    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;

    @ApiProperty({ required: false })
    @IsIn(['drivers', 'office'])
    @IsOptional()
    segment?: string;
}


export enum CompanyUserRole {
    LOGISTICIAN = 'LOGISTICIAN',
    WAREHOUSE_MANAGER = 'WAREHOUSE_MANAGER',
}

export class CreateCompanyUserDto {
    @ApiProperty({ description: 'Email', example: 'logist@company.kz' })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ description: 'Телефон', example: '+77001234567' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ description: 'Пароль', example: 'password123' })
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @ApiProperty({ description: 'Имя', example: 'Иван' })
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty({ description: 'Фамилия', example: 'Иванов' })
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ description: 'Роль', enum: CompanyUserRole, example: 'LOGISTICIAN' })
    @IsEnum(CompanyUserRole)
    role: CompanyUserRole;
}

export class UpdateCompanyUserDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ required: false, enum: CompanyUserRole })
    @IsEnum(CompanyUserRole)
    @IsOptional()
    role?: CompanyUserRole;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MinLength(6)
    password?: string;
}

export class UpdateCompanyProfileDto {
    @ApiProperty({ description: 'Название компании', required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ description: 'БИН (12 цифр)', required: false })
    @IsString()
    @IsOptional()
    bin?: string;

    @ApiProperty({ description: 'Юридический адрес', required: false })
    @IsString()
    @IsOptional()
    address?: string;

    @ApiProperty({ description: 'Фактический адрес', required: false })
    @IsString()
    @IsOptional()
    actualAddress?: string;

    @ApiProperty({ description: 'Телефон', required: false })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiProperty({ description: 'Email', required: false })
    @IsString()
    @IsOptional()
    email?: string;

    @ApiProperty({ description: 'ФИО директора', required: false })
    @IsString()
    @IsOptional()
    directorName?: string;

    @ApiProperty({ description: 'ИИК (номер счёта)', required: false })
    @IsString()
    @IsOptional()
    bankAccount?: string;

    @ApiProperty({ description: 'Название банка', required: false })
    @IsString()
    @IsOptional()
    bankName?: string;

    @ApiProperty({ description: 'БИК банка', required: false })
    @IsString()
    @IsOptional()
    bankBic?: string;

    @ApiProperty({ description: 'КБЕ', required: false })
    @IsString()
    @IsOptional()
    kbe?: string;

    @ApiProperty({ description: 'Менеджеры видят только свои заявки', required: false })
    @IsBoolean()
    @IsOptional()
    managersSeeOwnOrdersOnly?: boolean;

    @ApiProperty({ description: 'Менеджеры видят только своих контрагентов', required: false })
    @IsBoolean()
    @IsOptional()
    managersSeeOwnPartnersOnly?: boolean;
}

export class CreateDriverDto {
    @ApiProperty({ description: 'ID компании', example: 'cuid...', required: false })
    @IsString()
    @IsOptional()
    companyId?: string;

    @ApiProperty({ description: 'Имя', example: 'Иван' })
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty({ description: 'Фамилия', example: 'Иванов' })
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ description: 'Отчество', example: 'Иванович', required: false })
    @IsString()
    @IsOptional()
    middleName?: string;

    @ApiProperty({ description: 'Телефон', example: '+77001234567' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ description: 'Пароль для входа в мобильное приложение', required: false })
    @IsString()
    @IsOptional()
    password?: string;

    @ApiProperty({ description: 'ИИН', example: '123456789012', required: false })
    @IsString()
    @IsOptional()
    iin?: string;

    @ApiProperty({ description: 'Тип транспорта', example: 'Тент', required: false })
    @IsString()
    @IsOptional()
    vehicleType?: string;

    @ApiProperty({ description: 'Гос. номер авто', example: 'A123BC01', required: false })
    @IsString()
    @IsOptional()
    vehiclePlate?: string;

    @ApiProperty({ description: 'Модель автомобиля', example: 'Volvo FH16', required: false })
    @IsString()
    @IsOptional()
    vehicleModel?: string;

    @ApiProperty({ description: 'Номер прицепа', example: 'AB1234', required: false })
    @IsString()
    @IsOptional()
    trailerNumber?: string;

    @ApiProperty({ description: 'Вид документа', example: 'ID_CARD', required: false })
    @IsString()
    @IsOptional()
    docType?: string;

    @ApiProperty({ description: 'Номер документа', example: '012345678', required: false })
    @IsString()
    @IsOptional()
    docNumber?: string;

    @ApiProperty({ description: 'Дата выдачи', example: '2020-01-01T00:00:00.000Z', required: false })
    @IsString()
    @IsOptional()
    docIssuedAt?: string;

    @ApiProperty({ description: 'Действителен до', example: '2030-01-01T00:00:00.000Z', required: false })
    @IsString()
    @IsOptional()
    docExpiresAt?: string;

    @ApiProperty({ description: 'Кем выдан', example: 'МВД РК', required: false })
    @IsString()
    @IsOptional()
    docIssuedBy?: string;
}

export class UpdateDriverDto {
    @ApiProperty({ description: 'Пароль для входа в мобильное приложение', required: false })
    @IsString()
    @IsOptional()
    password?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    middleName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    iin?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    vehicleType?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    vehiclePlate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    vehicleModel?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    trailerNumber?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    docType?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    docNumber?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    docIssuedAt?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    docExpiresAt?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    docIssuedBy?: string;
}

export class CreateDepartmentDto {
    @ApiProperty({ description: 'Название отдела', example: 'Логистика' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'ID родительского отдела', example: 'cuid...', required: false })
    @IsString()
    @IsOptional()
    parentDepartmentId?: string;

    @ApiProperty({ description: 'Иконка отдела', example: 'TruckOutlined', required: false })
    @IsString()
    @IsOptional()
    icon?: string;
}

export class UpdateDepartmentDto {
    @ApiProperty({ description: 'Название отдела', example: 'Бухгалтерия' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Иконка отдела', example: 'DollarOutlined', required: false })
    @IsString()
    @IsOptional()
    icon?: string;
}

export class AssignUserDepartmentDto {
    @ApiProperty({ description: 'ID сотрудника', example: 'cuid...' })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({ description: 'ID отдела (null для удаления из всех отделов)', example: 'cuid...', required: false })
    @IsOptional()
    departmentId?: string | null;
}

export class CreateInvitationDto {
    @ApiProperty({ description: 'Email сотрудника', example: 'employee@company.kz' })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ description: 'Роль', enum: UserRole, example: 'LOGISTICIAN' })
    @IsEnum(UserRole)
    @IsNotEmpty()
    role: UserRole;

    @ApiProperty({ description: 'Права доступа', type: [String], required: false })
    @IsOptional()
    permissions?: string[];

    @ApiProperty({ description: 'ID отдела', required: false })
    @IsString()
    @IsOptional()
    departmentId?: string;

    @ApiProperty({ description: 'Должность / Роль', example: 'Старший логист', required: false })
    @IsString()
    @IsOptional()
    position?: string;

    @ApiProperty({ description: 'Организации, в которые дать доступ (мультикомпания). Не передан — во все компании владельца', type: [String], required: false })
    @IsArray()
    @IsOptional()
    sharedCompanyIds?: string[];
}

export class CreateVehicleDto {
    @ApiProperty({ description: 'Тип транспорта (Тент, Реф и др.)', example: 'Тент' })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({ description: 'Госномер автомобиля', example: '123ABC01' })
    @IsString()
    @IsNotEmpty()
    plate: string;

    @ApiProperty({ description: 'Модель автомобиля', example: 'Volvo FH16' })
    @IsString()
    @IsNotEmpty()
    model: string;

    @ApiProperty({ description: 'Номер прицепа (опционально)', required: false, example: 'AB1234' })
    @IsString()
    @IsOptional()
    trailerNumber?: string;

    @ApiProperty({ description: 'ID назначенного водителя (опционально)', required: false })
    @IsString()
    @IsOptional()
    driverId?: string;
}

export class UpdateVehicleDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    plate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    model?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    trailerNumber?: string;

    @ApiProperty({ description: 'ID назначенного водителя (опционально)', required: false })
    @IsString()
    @IsOptional()
    driverId?: string;
}


