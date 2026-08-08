import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { QuoteRequestsService } from './quote-requests.service';
import {
    CreateQuoteRequestDto,
    QuoteMemoryQueryDto,
    QuoteRequestsQueryDto,
    RejectQuoteRequestDto,
    UpdateQuoteRequestDto,
} from './dto/quote-request.dto';

/**
 * Запросы на расчёт стоимости — этап до заявки.
 *
 * Права те же, что у заявок: кто ведёт заявки, тот ведёт и запросы. Свой
 * отдельный пункт в правах доступа заводить не стали — это была бы ещё одна
 * галочка, которую администратор компании обязан не забыть проставить, ради
 * разделения, которого никто не просил.
 */
@ApiTags('quote-requests')
@Controller('quote-requests')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('orders')
@ApiBearerAuth()
export class QuoteRequestsController {
    constructor(private readonly service: QuoteRequestsService) { }

    // Те же роли, что и на запись. Без явного перечня сюда доходил бы
    // любой вошедший, кого не ограничивает PermissionsGuard, — водитель и
    // грузополучатель в том числе, а в запросах лежат предложенные клиенту
    // цены.
    @Get()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Список запросов на расчёт' })
    findAll(@Request() req: any, @Query() query: QuoteRequestsQueryDto) {
        return this.service.findAll(req.user.companyId, query);
    }

    /**
     * Память по клиенту и маршруту. Отдельным адресом, а не частью списка:
     * менеджеру она нужна в момент заполнения формы, когда запроса ещё нет.
     */
    @Post('memory')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Что уже предлагали этому клиенту на этом маршруте' })
    memory(@Request() req: any, @Body() query: QuoteMemoryQueryDto) {
        return this.service.memory(req.user.companyId, query);
    }

    @Get(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Карточка запроса' })
    findOne(@Request() req: any, @Param('id') id: string) {
        return this.service.findOne(req.user.companyId, id);
    }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Завести запрос' })
    create(@Request() req: any, @Body() dto: CreateQuoteRequestDto) {
        return this.service.create(req.user.companyId, req.user.sub, dto);
    }

    @Patch(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Изменить запрос или назначить цену' })
    update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateQuoteRequestDto) {
        return this.service.update(req.user.companyId, req.user.sub, id, dto);
    }

    @Post(':id/approve')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Клиент согласовал цену' })
    approve(@Request() req: any, @Param('id') id: string) {
        return this.service.approve(req.user.companyId, id, req.user.sub);
    }

    @Post(':id/reject')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Клиент отказался — с причиной' })
    reject(@Request() req: any, @Param('id') id: string, @Body() dto: RejectQuoteRequestDto) {
        return this.service.reject(req.user.companyId, id, dto.reason);
    }

    @Post(':id/reopen')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Вернуть запрос в работу' })
    reopen(@Request() req: any, @Param('id') id: string) {
        return this.service.reopen(req.user.companyId, id);
    }
}
