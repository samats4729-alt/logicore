import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExternalCompaniesService } from './external-companies.service';

@ApiTags('external-companies')
@Controller('external-companies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExternalCompaniesController {
    constructor(private readonly service: ExternalCompaniesService) { }

    @Get()
    @ApiOperation({ summary: 'Список внешних компаний' })
    async getAll(@Req() req: any) {
        return this.service.getExternalCompanies(req.user.companyId);
    }

    @Post()
    @ApiOperation({ summary: 'Создать внешнюю компанию' })
    async create(@Req() req: any, @Body() dto: {
        name: string;
        bin?: string;
        phone?: string;
        email?: string;
        type: 'CUSTOMER' | 'FORWARDER';
        address?: string;
        directorName?: string;
    }) {
        return this.service.createExternalCompany(req.user.companyId, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Обновить внешнюю компанию' })
    async update(@Req() req: any, @Param('id') id: string, @Body() dto: {
        name?: string;
        bin?: string;
        phone?: string;
        email?: string;
        address?: string;
        directorName?: string;
    }) {
        return this.service.updateExternalCompany(req.user.companyId, id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Удалить внешнюю компанию' })
    async delete(@Req() req: any, @Param('id') id: string) {
        return this.service.deleteExternalCompany(req.user.companyId, id);
    }
}
