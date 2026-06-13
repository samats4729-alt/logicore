import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional } from 'class-validator';

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

