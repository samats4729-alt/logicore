import { Controller, Get, Post, Put, Body, Query, UseGuards, Request, Param } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole } from '@prisma/client';

@Controller('partners')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN, UserRole.ACCOUNTANT)
export class PartnersController {
    constructor(private readonly partnersService: PartnersService) { }

    @Get()
    async getMyPartners(@Request() req: any) {
        const companyId = req.user.companyId;
        const partnerships = await this.partnersService.getMyPartners(companyId);

        // Flatten result to just list companies
        return partnerships.map((p: any) =>
            p.requesterId === companyId ? p.recipient : p.requester
        );
    }

    @Get('requests')
    @RequirePermissions('partners')
    async getRequests(@Request() req: any) {
        return this.partnersService.getIncomingRequests(req.user.companyId);
    }

    @Get('sent')
    @RequirePermissions('partners')
    async getSentRequests(@Request() req: any) {
        return this.partnersService.getOutgoingRequests(req.user.companyId);
    }

    @Get('search')
    @RequirePermissions('partners')
    async search(
        @Request() req: any,
        @Query('query') query: string,
        @Query('page') page: string,
        @Query('limit') limit: string
    ) {
        const pageNum = page ? parseInt(page) : 1;
        const limitNum = limit ? parseInt(limit) : 20;
        return this.partnersService.searchCompanies(req.user.companyId, query, pageNum, limitNum);
    }

    @Post('invite')
    @RequirePermissions('partners')
    async invite(@Request() req: any, @Body() body: { recipientId: string }) {
        return this.partnersService.invite(req.user.companyId, body.recipientId);
    }

    @Put(':id/accept')
    @RequirePermissions('partners')
    async accept(@Request() req: any, @Param('id') id: string) {
        return this.partnersService.accept(id, req.user.companyId);
    }

    @Put(':id/reject')
    @RequirePermissions('partners')
    async reject(@Request() req: any, @Param('id') id: string) {
        return this.partnersService.reject(id, req.user.companyId);
    }
}