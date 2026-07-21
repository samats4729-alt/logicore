import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { IdentityService } from './identity.service';

/**
 * ФАЗА 1: управление слоем «Личность». Только для платформенного администратора.
 * Ничего в существующей логике не меняет — служебные операции миграции.
 */
@ApiTags('admin-identity')
@Controller('admin/identity')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class IdentityController {
    constructor(private identityService: IdentityService) {}

    @Post('backfill-persons')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Создать Person для всех пользователей без личности (1:1, без слияния)' })
    async backfillPersons() {
        return this.identityService.backfillPersons();
    }

    @Get('duplicate-persons')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Показать возможные дубликаты (совпадение телефона/ИИН). Ничего не объединяет' })
    async getDuplicates() {
        return this.identityService.getPotentialDuplicates();
    }

    @Post('merge-persons')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Объединить выбранные личности в одну (обратимо, по подтверждению)' })
    async mergePersons(@Request() req: any, @Body() dto: { targetPersonId: string; sourcePersonIds: string[] }) {
        return this.identityService.mergePersons(dto.targetPersonId, dto.sourcePersonIds || [], req.user?.sub);
    }

    @Get('merges')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'История активных объединений (для отката)' })
    async getMerges() {
        return this.identityService.getMergeHistory();
    }

    @Post('merges/:id/revert')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Полностью отменить (разъединить) объединение' })
    async revertMerge(@Param('id') id: string) {
        return this.identityService.revertMerge(id);
    }
}
