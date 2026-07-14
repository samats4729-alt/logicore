import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { AdminStatsService } from './admin-stats.service';

@ApiTags('admin-stats')
@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminStatsController {
    constructor(private adminStatsService: AdminStatsService) { }

    @Get()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Сводная статистика платформы для админ-панели' })
    async getOverview() {
        return this.adminStatsService.getOverview();
    }
}
