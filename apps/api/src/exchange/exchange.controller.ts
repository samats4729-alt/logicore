import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AllowWithoutCompany, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { AuditService } from '../audit/audit.service';
import { ExchangeService } from './exchange.service';
import { ExchangeOffersService } from './exchange-offers.service';
import { exchangeEnabled, ExchangeEnabledGuard } from './exchange-enabled.guard';
import { companyHasExchange, ExchangeCompanyAccessGuard } from './exchange-access';
import { ExchangeBoardQueryDto, MakeOfferDto, PublishOrderDto, RoutePricesQueryDto, UnpublishOrderDto } from './dto/exchange-order.dto';

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
        // Владельцу платформы биржа видна всегда — иначе в админке пропал бы
        // и сам раздел, где ставят доступ. У администратора бывает своя
        // компания, поэтому смотрим на роль, а не на её отсутствие.
        if (req.user.role === UserRole.ADMIN || !req.user.companyId) return { enabled: true, isPark: false };
        // Компании — только если её отметили в админке.
        if (!(await companyHasExchange(this.prisma, req.user.companyId))) return { enabled: false, isPark: false };
        const company = await this.prisma.company.findUnique({ where: { id: req.user.companyId }, select: { isPark: true } });
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
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, ExchangeCompanyAccessGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('orders')
@Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
@ApiBearerAuth()
export class ExchangeController {
    constructor(
        private readonly service: ExchangeService,
        private readonly offers: ExchangeOffersService,
        private readonly audit: AuditService,
    ) {}

    @Get('board')
    @ApiOperation({ summary: 'Биржа: заявки других компаний, которые ищут исполнителя' })
    async board(@Request() req: any, @Query() query: ExchangeBoardQueryDto) {
        const [list, offered] = await Promise.all([
            this.service.board(req.user.companyId, query),
            this.offers.companyOfferedOrderIds(req.user.companyId),
        ]);
        return list.map((o) => ({ ...o, myOfferStatus: offered[o.id] ?? null }));
    }

    @Get('board/:id')
    @ApiOperation({ summary: 'Заявка с биржи — как её видят другие' })
    async card(@Request() req: any, @Param('id') id: string) {
        const card = await this.service.card(req.user.companyId, id);
        return { ...card, myOffer: await this.offers.companyOffer(req.user.companyId, id) };
    }

    @Post('board/:id/offer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Откликнуться на заявку с биржи: согласен на цену или своя цена' })
    offer(@Request() req: any, @Param('id') id: string, @Body() dto: MakeOfferDto) {
        return this.offers.offerAsCompany(req.user.companyId, req.user.sub, id, dto);
    }

    @Post('board/:id/offer/withdraw')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Отозвать свой отклик' })
    withdraw(@Request() req: any, @Param('id') id: string) {
        return this.offers.withdrawAsCompany(req.user.companyId, id);
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

    @Get('orders/:id/offers')
    @ApiOperation({ summary: 'Отклики на свою заявку' })
    orderOffers(@Request() req: any, @Param('id') id: string) {
        return this.offers.offersForOrder(req.user.companyId, id);
    }

    @Post('orders/:id/offers/:offerId/accept')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Выбрать исполнителя из откликов' })
    async accept(@Request() req: any, @Param('id') id: string, @Param('offerId') offerId: string) {
        const result = await this.offers.accept(req.user.companyId, req.user.sub, id, offerId);
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: `Заявка ${result.orderNumber}: с биржи выбран исполнитель ${result.executor} за ${result.price.toLocaleString('ru-RU')} ₸`,
            orderId: id,
        });
        return result;
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
