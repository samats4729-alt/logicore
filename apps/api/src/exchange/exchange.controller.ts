import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AllowWithoutCompany, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { AuditService } from '../audit/audit.service';
import { ExchangeService } from './exchange.service';
import { exchangeEnabled, ExchangeEnabledGuard } from './exchange-enabled.guard';
import { ExchangeBoardQueryDto, PublishOrderDto, RoutePricesQueryDto, UnpublishOrderDto } from './dto/exchange-order.dto';

/**
 * Включена ли биржа и парк ли компания — кабинет по этому решает, какие
 * вкладки показывать. Приложение водителя (без компании) спрашивает то же.
 */
@ApiTags('exchange')
@Controller('exchange')
@UseGuards(JwtAuthGuard)
@AllowWithoutCompany()
@ApiBearerAuth()
export class ExchangeStatusController {
    constructor(private readonly prisma: PrismaService) {}

    @Get('status')
    @ApiOperation({ summary: 'Включена ли биржа на этом сервере' })
    async status(@Request() req: any) {
        if (!exchangeEnabled()) return { enabled: false, isPark: false };
        const company = req.user.companyId
            ? await this.prisma.company.findUnique({ where: { id: req.user.companyId }, select: { isPark: true } })
            : null;
        return { enabled: true, isPark: !!company?.isPark };
    }
}

/**
 * Биржа со стороны компании.
 *
 * Права — как у заявок: кто ведёт заявки, тот и выставляет их на биржу, и
 * смотрит чужие. Водитель и грузополучатель сюда не попадают — у водителя
 * своя сторона биржи, в приложении.
 */
@ApiTags('exchange')
@Controller('exchange')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('orders')
@Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
@ApiBearerAuth()
export class ExchangeController {
    constructor(
        private readonly service: ExchangeService,
        private readonly audit: AuditService,
    ) {}

    @Get('board')
    @ApiOperation({ summary: 'Биржа: заявки других компаний, которые ищут исполнителя' })
    board(@Request() req: any, @Query() query: ExchangeBoardQueryDto) {
        return this.service.board(req.user.companyId, query);
    }

    @Get('board/:id')
    @ApiOperation({ summary: 'Заявка с биржи — как её видят другие' })
    card(@Request() req: any, @Param('id') id: string) {
        return this.service.card(req.user.companyId, id);
    }

    @Get('mine')
    @ApiOperation({ summary: 'Свои заявки на бирже' })
    mine(@Request() req: any) {
        return this.service.mine(req.user.companyId);
    }

    @Get('orders/:id')
    @ApiOperation({ summary: 'Биржа в карточке заявки: на бирже ли и можно ли выставить' })
    state(@Request() req: any, @Param('id') id: string) {
        return this.service.state(req.user.companyId, id);
    }

    @Post('orders/:id/publish')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Выставить заявку на биржу' })
    async publish(@Request() req: any, @Param('id') id: string, @Body() dto: PublishOrderDto) {
        const state = await this.service.publish(req.user.companyId, req.user.sub, id, dto);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: `Заявка ${state.orderNumber} выставлена на биржу за ${dto.price.toLocaleString('ru-RU')} ₸`,
        });
        return state;
    }

    @Post('orders/:id/unpublish')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Снять заявку с биржи' })
    async unpublish(@Request() req: any, @Param('id') id: string, @Body() dto: UnpublishOrderDto) {
        const state = await this.service.unpublish(req.user.companyId, id, dto.reason);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: `Заявка ${state.orderNumber} снята с биржи: ${dto.reason}`,
        });
        return state;
    }

    @Post('route-prices')
    @ApiOperation({ summary: 'Почём возили по направлению' })
    routePrices(@Request() req: any, @Body() query: RoutePricesQueryDto) {
        return this.service.routePrices(req.user.companyId, query);
    }
}
