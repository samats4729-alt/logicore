import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('contracts')
@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ContractsController {
    constructor(private contractsService: ContractsService) { }

    // ==================== CONTRACTS ====================

    @Post()
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Создать договор (экспедитор)' })
    async createContract(
        @Body() dto: {
            customerCompanyId: string;
            contractNumber: string;
            startDate?: Date;
            endDate?: Date;
            notes?: string;
        },
        @Request() req: any,
    ) {
        return this.contractsService.createContract(req.user.companyId, dto);
    }

    @Get()
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список договоров' })
    async getContracts(@Request() req: any) {
        return this.contractsService.getContracts(req.user.companyId);
    }

    @Get('pending-agreements')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить входящие доп. соглашения на согласование' })
    async getPendingAgreements(@Request() req: any) {
        return this.contractsService.getPendingAgreements(req.user.companyId);
    }

    @Get('tariff-lookup')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Поиск тарифа по маршруту' })
    async lookupTariff(
        @Query('originCity') originCity: string,
        @Query('destinationCity') destinationCity: string,
        @Query('forwarderCompanyId') forwarderCompanyId?: string,
        @Query('vehicleType') vehicleType?: string,
        @Request() req?: any,
    ) {
        // Если указан экспедитор, ищем тариф между заказчиком и конкретным экспедитором
        if (forwarderCompanyId) {
            return this.contractsService.lookupTariff(
                req.user.companyId,
                forwarderCompanyId,
                originCity,
                destinationCity,
                vehicleType,
            );
        }

        // Иначе ищем по всем договорам заказчика
        return this.contractsService.lookupTariffForCustomer(
            req.user.companyId,
            originCity,
            destinationCity,
            vehicleType,
        );
    }

    @Get(':id')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить договор по ID' })
    async getContract(@Param('id') id: string, @Request() req: any) {
        return this.contractsService.getContract(id, req.user.companyId);
    }

    // ==================== AGREEMENTS ====================

    @Post(':contractId/agreements')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать доп. соглашение' })
    async createAgreement(
        @Param('contractId') contractId: string,
        @Body() dto: {
            agreementNumber: string;
            validFrom?: Date;
            validTo?: Date;
            notes?: string;
            tariffs?: { originCityId: string; destinationCityId: string; price: number; vehicleType?: string }[];
        },
        @Request() req: any,
    ) {
        return this.contractsService.createAgreement(req.user.companyId, contractId, {
            ...dto,
            createdById: req.user.id,
        });
    }

    @Put('agreements/:id/send')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Отправить доп. соглашение на согласование' })
    async sendForApproval(@Param('id') id: string, @Request() req: any) {
        return this.contractsService.sendAgreementForApproval(req.user.companyId, id);
    }

    @Put('agreements/:id/approve')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Утвердить доп. соглашение' })
    async approveAgreement(@Param('id') id: string, @Request() req: any) {
        return this.contractsService.approveAgreement(req.user.companyId, id, req.user.id);
    }

    @Put('agreements/:id/reject')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Отклонить доп. соглашение' })
    async rejectAgreement(
        @Param('id') id: string,
        @Body() dto: { reason?: string },
        @Request() req: any,
    ) {
        return this.contractsService.rejectAgreement(req.user.companyId, id, dto.reason);
    }

    // ==================== TARIFFS ====================

    @Post('agreements/:agreementId/tariffs')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Добавить тариф' })
    async addTariff(
        @Param('agreementId') agreementId: string,
        @Body() dto: {
            originCityId: string;
            destinationCityId: string;
            price: number;
            vehicleType?: string;
        },
        @Request() req: any,
    ) {
        return this.contractsService.addTariff(req.user.companyId, agreementId, dto);
    }

    @Put('tariffs/:id')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить тариф' })
    async updateTariff(
        @Param('id') id: string,
        @Body() dto: { price?: number; vehicleType?: string; isActive?: boolean },
        @Request() req: any,
    ) {
        return this.contractsService.updateTariff(req.user.companyId, id, dto);
    }

    @Delete('tariffs/:id')
    @Roles(UserRole.FORWARDER)
    @ApiOperation({ summary: 'Удалить тариф' })
    async removeTariff(@Param('id') id: string, @Request() req: any) {
        return this.contractsService.removeTariff(req.user.companyId, id);
    }
}
