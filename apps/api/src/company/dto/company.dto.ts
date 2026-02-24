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

    @ApiProperty({ description: 'Адрес', required: false })
    @IsString()
    @IsOptional()
    address?: string;

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
