import { Controller, Post, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { DriverService } from './driver.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

// Генерация/отзыв ссылки для водителя — для сотрудников компании.
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverAdminController {
    constructor(private readonly driverService: DriverService) { }

    @Post(':id/driver-link')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    async generate(@Request() req: any, @Param('id') id: string, @Body() body: { regenerate?: boolean }) {
        return this.driverService.generateLink(id, req.user.companyId, !!body?.regenerate);
    }

    @Delete(':id/driver-link')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    async revoke(@Request() req: any, @Param('id') id: string) {
        return this.driverService.revokeLink(id, req.user.companyId);
    }
}
