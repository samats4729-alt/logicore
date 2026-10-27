import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * Договор парка с владельцем машины (Q9): кто владелец, какая машина,
 * сколько платим. Обязательно то, без чего договор не оформить вовсе;
 * остальное парк может дописать позже — до подписи договор правится.
 */
export class VehicleOwnerContractDto {
    @ApiProperty({ enum: ['PERSON', 'COMPANY'], description: 'PERSON — человек, COMPANY — ТОО или ИП' })
    @IsIn(['PERSON', 'COMPANY'])
    ownerKind: 'PERSON' | 'COMPANY';

    @ApiProperty({ description: 'ФИО или название организации' })
    @IsString()
    @IsNotEmpty({ message: 'Укажите, кто владелец машины' })
    @MaxLength(300)
    ownerName: string;

    @ApiProperty({ required: false, description: 'ИИН или БИН — 12 цифр' })
    @IsOptional()
    @Matches(/^\d{12}$/, { message: 'ИИН или БИН — 12 цифр' })
    ownerIinBin?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(40)
    ownerIdNumber?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    ownerIdIssuedBy?: string | null;

    @ApiProperty({ required: false, example: '2016-03-15' })
    @IsOptional()
    @IsDateString({}, { message: 'Дата выдачи удостоверения — в формате ГГГГ-ММ-ДД' })
    ownerIdIssuedAt?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    ownerAddress?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    ownerPhone?: string | null;

    @ApiProperty({ required: false, example: 'KZ12345678901234567890' })
    @IsOptional()
    @Matches(/^KZ[0-9A-Z]{18}$/, { message: 'Счёт (IBAN) — KZ и ещё 18 знаков, без пробелов' })
    ownerIban?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    ownerBank?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    ownerBankBic?: string | null;

    @ApiProperty({ required: false, description: 'Кто подписывает за организацию-владельца' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    ownerSigner?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    vehicleModel?: string | null;

    @ApiProperty()
    @IsString()
    @IsNotEmpty({ message: 'Укажите госномер машины' })
    @MaxLength(20)
    vehiclePlate: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(40)
    vehicleRegNumber?: string | null;

    @ApiProperty({ description: 'Арендная плата, ₸' })
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Арендная плата — число' })
    @Min(1, { message: 'Укажите арендную плату' })
    @Max(1_000_000_000)
    rentAmount: number;

    @ApiProperty({ enum: ['TRIP', 'MONTH'] })
    @IsIn(['TRIP', 'MONTH'])
    rentBasis: 'TRIP' | 'MONTH';
}
