import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class RequestSmsCodeDto {
    @ApiProperty({
        description: 'Номер телефона в формате +7XXXXXXXXXX',
        example: '+77001234567'
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[0-9]{10,15}$/, { message: 'Некорректный формат номера телефона' })
    phone: string;
}

export class VerifySmsCodeDto {
    @ApiProperty({ example: '+77001234567' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ description: '4-значный код из SMS', example: '1234' })
    @IsString()
    @IsNotEmpty()
    @MinLength(4)
    code: string;

    @ApiProperty({ description: 'Уникальный ID устройства', example: 'device-uuid-123' })
    @IsString()
    @IsNotEmpty()
    deviceId: string;
}

export class LoginEmailDto {
    @ApiProperty({ example: 'admin@logcomp.kz' })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ example: 'password123' })
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @ApiProperty({ description: 'Уникальный ID устройства', example: 'browser-uuid-123' })
    @IsString()
    @IsNotEmpty()
    deviceId: string;
}

export class RegisterCompanyDto {
    @ApiProperty({ description: 'Название компании', example: 'ТОО КазЛогистик' })
    @IsString()
    @IsNotEmpty()
    companyName: string;

    @ApiProperty({ description: 'БИН компании', example: '123456789012', required: false })
    @IsString()
    bin?: string;

    @ApiProperty({ description: 'Email админа компании', example: 'admin@kazlogistic.kz' })
    @IsEmail()
    @IsNotEmpty()
    adminEmail: string;

    @ApiProperty({ description: 'Пароль админа', example: 'password123' })
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    adminPassword: string;

    @ApiProperty({ description: 'Имя админа', example: 'Иван' })
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty({ description: 'Фамилия админа', example: 'Иванов' })
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ description: 'Телефон', example: '+77001234567' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[0-9]{10,15}$/, { message: 'Некорректный формат номера телефона' })
    phone: string;
}
