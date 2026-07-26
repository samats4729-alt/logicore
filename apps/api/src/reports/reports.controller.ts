import { Body, Controller, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { ExportReportDto } from './dto/report-export.dto';
import { ReportExportService } from './report-export.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('reports')
export class ReportsController {
    constructor(private readonly exportService: ReportExportService) {}

    @Post('export')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.FORWARDER)
    @ApiOperation({
        summary: 'Выгрузить отчёт в Excel с печатной шапкой',
        description: 'Строки приходят с экрана: в файле ровно то, что видит человек.',
    })
    async exportReport(@Request() req: any, @Body() dto: ExportReportDto, @Res() res: Response) {
        const { buffer, fileName } = await this.exportService.export(req.user.companyId, dto);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            // Кириллица в имени файла — только через filename*.
            'Content-Disposition': `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }
}
