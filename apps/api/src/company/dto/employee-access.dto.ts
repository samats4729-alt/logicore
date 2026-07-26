import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsString, ValidateNested } from 'class-validator';

export class EmployeeAccessItemDto {
    @ApiProperty({ description: 'Организация, к которой даётся доступ' })
    @IsString()
    companyId!: string;

    @ApiProperty({ enum: UserRole, description: 'Роль сотрудника именно в этой организации' })
    @IsEnum(UserRole)
    role!: UserRole;
}

export class SetEmployeeAccessDto {
    @ApiProperty({
        type: [EmployeeAccessItemDto],
        description: 'Полный список доступов. Чего нет в списке — будет отозвано.',
    })
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => EmployeeAccessItemDto)
    items!: EmployeeAccessItemDto[];
}
