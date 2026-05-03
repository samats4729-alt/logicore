import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, IsEmail, IsEnum, IsOptional, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
    @ApiProperty({ example: '+77001234567' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[0-9]{10,15}$/)
    phone: string;

    @ApiProperty({ required: false, example: 'user@logcomp.kz' })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ required: false, example: 'password123' })
    @IsString()
    @IsOptional()
    @MinLength(6)
    password?: string;

    @ApiProperty({ example: 'Иван' })
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty({ example: 'Иванов' })
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ required: false, example: 'Петрович' })
    @IsString()
    @IsOptional()
    middleName?: string;

    @ApiProperty({ enum: UserRole, example: 'DRIVER' })
    @IsEnum(UserRole)
    role: UserRole;

    @ApiProperty({ required: false, example: '123ABC01' })
    @IsString()
    @IsOptional()
    vehiclePlate?: string;

    @ApiProperty({ required: false, example: 'MAN TGX' })
    @IsString()
    @IsOptional()
    vehicleModel?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    companyId?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) { }
