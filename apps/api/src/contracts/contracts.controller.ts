import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, Res, Header, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContractsService } from './contracts.service';
import { ContractPdfService } from './contract-pdf.service';
import { ContractSignedFileService } from './contract-signed-file.service';
import { ContractCollabService } from './contract-collab.service';
import { getDefaultContractTemplate } from './contract-template';
import { fileResponseHeaders, MAX_UPLOAD_SIZE } from '../documents/allowed-files';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole } from '@prisma/client';

@ApiTags('contracts')
@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('partners')
@ApiBearerAuth()
export class ContractsController {
    constructor(
        private contractsService: ContractsService,
        private contractPdfService: ContractPdfService,
        private signedFiles: ContractSignedFileService,
        private collab: ContractCollabService,
    ) { }

    // ==================== CONTRACTS ====================

    @Post()
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать договор (экспедитор или заказчик)' })
    async createContract(
        @Body() dto: {
            myRole?: 'FORWARDER' | 'CUSTOMER';
            partnerCompanyId?: string;
            customerCompanyId?: string;
            forwarderCompanyId?: string;
            contractNumber: string;
            startDate?: Date;
            endDate?: Date;
            notes?: string;
            myCompanyId?: string;
        },
        @Request() req: any,
    ) {
        return this.contractsService.createContract(
            req.user.companyId, req.user.role, dto, req.user.sub,
        );
    }

    @Get()
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить список договоров' })
    async getContracts(@Request() req: any) {
        return this.contractsService.getContracts(req.user.companyId);
    }

    @Get('my-companies')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Организации, от имени которых можно заключить договор' })
    async getMyContractCompanies(@Request() req: any) {
        return this.contractsService.getMyContractCompanies(req.user.sub, req.user.companyId);
    }

    @Get('pending-agreements')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить входящие доп. соглашения на согласование' })
    async getPendingAgreements(@Request() req: any) {
        return this.contractsService.getPendingAgreements(req.user.companyId);
    }

    @Get('tariff-lookup')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @RequirePermissions('partners', 'orders')
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

    @Get(':id/content')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Получить содержимое (статьи) договора' })
    async getContractContent(@Param('id') id: string, @Request() req: any) {
        return this.contractsService.getContractContent(id, req.user.companyId);
    }

    @Put(':id/content')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Сохранить отредактированный текст договора' })
    async updateContractContent(
        @Param('id') id: string,
        @Body() dto: { content: any },
        @Request() req: any,
    ) {
        // Каждое сохранение — версия в истории; где договор согласуется со
        // второй стороной в LogiCore, напрямую не сохраняется (G6).
        return this.collab.saveDirect(id, { companyId: req.user.companyId, userId: req.user.sub }, dto.content);
    }

    // ==================== СОГЛАСОВАНИЕ ТЕКСТА (G6) ====================

    @Get(':id/collab')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Согласование текста: версия, предложения правок, история версий' })
    async getCollab(@Param('id') id: string, @Request() req: any) {
        return this.collab.state(id, req.user.companyId);
    }

    @Get(':id/revisions/:version')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Текст одной версии договора и предыдущей — для сравнения' })
    async getRevision(@Param('id') id: string, @Param('version') version: string, @Request() req: any) {
        return this.collab.revision(id, req.user.companyId, Number(version));
    }

    @Get(':id/proposals/:proposalId')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Предложение правок целиком: предлагаемый текст и исходный' })
    async getProposal(@Param('id') id: string, @Param('proposalId') proposalId: string, @Request() req: any) {
        return this.collab.proposal(id, req.user.companyId, proposalId);
    }

    @Post(':id/proposals')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Предложить второй стороне правки текста договора' })
    async propose(@Param('id') id: string, @Body() dto: { content: any; summary?: string }, @Request() req: any) {
        return this.collab.propose(id, { companyId: req.user.companyId, userId: req.user.sub }, dto.content, dto.summary);
    }

    // Принять или отклонить правки к договору — решение руководителя, а не
    // любого сотрудника с доступом к договорам.
    @Post(':id/proposals/:proposalId/accept')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Принять правки второй стороны — станут новой версией текста' })
    async acceptProposal(@Param('id') id: string, @Param('proposalId') proposalId: string, @Body() dto: { note?: string }, @Request() req: any) {
        return this.collab.accept(id, { companyId: req.user.companyId, userId: req.user.sub }, proposalId, dto?.note);
    }

    @Post(':id/proposals/:proposalId/reject')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Отклонить правки второй стороны с причиной' })
    async rejectProposal(@Param('id') id: string, @Param('proposalId') proposalId: string, @Body() dto: { reason: string }, @Request() req: any) {
        return this.collab.reject(id, { companyId: req.user.companyId, userId: req.user.sub }, proposalId, dto?.reason);
    }

    @Post(':id/proposals/:proposalId/withdraw')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Отозвать свои правки, пока по ним нет решения' })
    async withdrawProposal(@Param('id') id: string, @Param('proposalId') proposalId: string, @Request() req: any) {
        return this.collab.withdraw(id, { companyId: req.user.companyId, userId: req.user.sub }, proposalId);
    }

    @Get(':id/requisites-draft')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Заготовка реквизитов сторон из карточек компаний' })
    async getRequisitesDraft(@Param('id') id: string, @Request() req: any) {
        return this.contractsService.getRequisitesDraft(id, req.user.companyId);
    }

    @Put(':id/organization')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({
        summary: 'Сменить свою организацию — сторону договора',
        description: 'Только пока по договору не выписано ни одного документа.',
    })
    async changeContractOrganization(
        @Param('id') id: string,
        @Body() dto: { companyId: string },
        @Request() req: any,
    ) {
        return this.contractsService.changeContractOrganization(
            id, req.user.sub, req.user.companyId, dto.companyId,
        );
    }

    @Post(':id/reset-content')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Сбросить текст договора к шаблону по умолчанию' })
    async resetContractContent(@Param('id') id: string, @Request() req: any) {
        return this.collab.saveDirect(id, { companyId: req.user.companyId, userId: req.user.sub }, getDefaultContractTemplate(), 'RESET');
    }

    @Get(':id/pdf')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Скачать PDF договора' })
    async downloadContractPdf(
        @Param('id') id: string,
        @Request() req: any,
        @Res() res: Response,
        // Как флажок «Подпись и печать» в 1С: по умолчанию документ чистый,
        // печать добавляется только по явному запросу — и только своя.
        @Query('withStamp') withStamp?: string,
    ) {
        // Проверяем доступ через getContract (выбрасывает ForbiddenException если не сторона)
        await this.contractsService.getContract(id, req.user.companyId);
        const pdfBuffer = await this.contractPdfService.generateContractPdf(id, {
            requestingCompanyId: req.user.companyId,
            withStamp: withStamp === 'true',
        });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Contract_${id}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.end(pdfBuffer);
    }

    // Подписанный экземпляр (G5): один файл на договор, видят обе стороны.

    @Post(':id/signed-file')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE } }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Приложить подписанный договор' })
    async uploadSignedFile(
        @Param('id') id: string,
        @Request() req: any,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.signedFiles.attach(id, req.user.companyId, file);
    }

    @Get(':id/signed-file')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Скачать подписанный договор' })
    async downloadSignedFile(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
        const { fileName, mimeType, stream } = await this.signedFiles.open(id, req.user.companyId);
        res.set(fileResponseHeaders(fileName, mimeType));
        stream.pipe(res);
    }

    @Delete(':id/signed-file')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Убрать подписанный договор' })
    async removeSignedFile(@Param('id') id: string, @Request() req: any) {
        return this.signedFiles.remove(id, req.user.companyId);
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
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Обновить тариф' })
    async updateTariff(
        @Param('id') id: string,
        @Body() dto: { price?: number; vehicleType?: string; isActive?: boolean },
        @Request() req: any,
    ) {
        return this.contractsService.updateTariff(req.user.companyId, id, dto);
    }

    @Delete('tariffs/:id')
    @Roles(UserRole.FORWARDER, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Удалить тариф' })
    async removeTariff(@Param('id') id: string, @Request() req: any) {
        return this.contractsService.removeTariff(req.user.companyId, id);
    }
}