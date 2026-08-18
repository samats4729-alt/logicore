import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { OrdersExportService } from './orders-export.service';
import { PowerOfAttorneyService } from './power-of-attorney.service';
import { OrderContractService } from './order-contract.service';
import { OrderDocumentsService } from './order-documents.service';
import { OrderSettlementsService } from './order-settlements.service';
import { ACCOUNTING_ORDER_FIELDS, canTouchAccounting } from '../auth/accounting-access';
import { CompanyVerifiedGuard, RequireVerifiedCompany } from '../company/guards/company-verified.guard';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { CreateOrderDto, UpdateStatusDto, AssignDriverDto, OrdersQueryDto } from './dto/order.dto';
import { UserRole, OrderStatus, OrderDocumentKind } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, CompanyVerifiedGuard)
@RequirePermissions('orders')
@ApiBearerAuth()
export class OrdersController {
    constructor(
        private ordersService: OrdersService,
        private poaService: PowerOfAttorneyService,
        private contractService: OrderContractService,
        private orderDocuments: OrderDocumentsService,
        private settlements: OrderSettlementsService,
        private emailService: EmailService,
        private prisma: PrismaService,
        private billingService: BillingService,
        private ordersExport: OrdersExportService,
        private auditService: AuditService,
    ) { }

    @Post()
    @RequireVerifiedCompany()
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Создать заявку на перевозку' })
    async create(@Body() dto: CreateOrderDto, @Request() req: any) {
        if (req.user.companyId) {
            await this.billingService.assertOrderLimit(req.user.companyId);
        }

        const { responsibleUserId, ...orderDto } = dto as any;
        const order = await this.ordersService.create({
            ...orderDto,
            customerId: dto.customerId || req.user.sub,
            responsibleManagerId: req.user.sub,
            ownerCompanyId: req.user.companyId || undefined,
            customerPaymentDate: dto.customerPaymentDate ? new Date(dto.customerPaymentDate) : undefined,
            driverPaymentDate: dto.driverPaymentDate ? new Date(dto.driverPaymentDate) : undefined,
        });

        // Ответственный от компании создателя: по умолчанию — сам создатель;
        // можно назначить другого менеджера (помощник вбивает заявки) или
        // "NONE" — не назначать, тогда заявку видят все менеджеры («кто возьмёт»)
        if (req.user.companyId) {
            if (responsibleUserId === 'NONE') {
                // без ответственного
            } else if (responsibleUserId && responsibleUserId !== req.user.sub) {
                await this.ordersService.reassignResponsible(order.id, req.user.companyId, responsibleUserId);
            } else {
                await this.ordersService.setCompanyResponsible(order.id, req.user.companyId, req.user.sub, true);
            }
        }

        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'CREATE',
            entity: 'order',
            entityId: order.id,
            entityLabel: `Заявка №${order.orderNumber}`,
            details: { customerPrice: dto.customerPrice ?? null, driverCost: dto.driverCost ?? null },
            orderId: order.id,
        });

        return order;
    }

    @Get('numbering-settings')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Настройка нумерации заявок' })
    async getNumberingSettings(@Request() req: any) {
        return this.ordersService.getNumberingSettings(req.user.companyId);
    }

    @Put('numbering-settings')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Сохранить настройку нумерации заявок' })
    async updateNumberingSettings(@Request() req: any, @Body() body: { prefix?: string; padding?: number; nextNumber?: number }) {
        return this.ordersService.updateNumberingSettings(req.user.companyId, body);
    }

    @Post('renumber')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Перенумеровать существующие заявки под текущий формат' })
    async renumberOrders(@Request() req: any) {
        return this.ordersService.renumberAllOrders(req.user.companyId);
    }

    @Get()
    // Бухгалтер здесь не «на всякий случай»: экраны расходов, операций и
    // кассы сами запрашивают этот список, чтобы дать выбрать заявку —
    // без него обязательное поле «Заявка» оставалось пустым, и расход
    // с типом «по заявке» нельзя было сохранить вообще. Отдельную заявку
    // (`findOne` ниже) бухгалтер и раньше открывал — не пускал только список.
    //
    // Завскладом — та же история. Право «Заявки» ему выдают (склад должен
    // видеть, что и когда приедет), в меню раздел показывался, страница
    // открывалась — а список отвечал отказом. Право есть, толку нет.
    // Класс контроллера требует право `orders`, поэтому сюда попадёт только
    // тот завскладом, кому его выдал руководитель.
    //
    // Экспедитор в этом перечне отсутствовал. Роль выдаётся в «Сотрудниках»
    // тому, кто ведёт рейсы, — а список заявок отвечал ему отказом. Пункт в
    // меню при этом был, страница открывалась, и человек видел пустоту.
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.LOGISTICIAN, UserRole.ACCOUNTANT, UserRole.WAREHOUSE_MANAGER,
    )
    @ApiOperation({ summary: 'Получить список заявок' })
    @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
    @ApiQuery({ name: 'customerId', required: false })
    @ApiQuery({ name: 'driverId', required: false })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, description: 'Номер, груз, город маршрута или заказчик' })
    async findAll(@Query() query: OrdersQueryDto, @Request() req?: any) {
        const companyId = req?.user?.role === 'ADMIN' ? undefined : req?.user?.companyId;
        const { status, customerId, driverId, search, ...pagination } = query;
        return this.ordersService.findAll({ status, customerId, driverId, companyId, search }, pagination);
    }

    @Post('export')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.LOGISTICIAN, UserRole.ACCOUNTANT,
    )
    @ApiOperation({
        summary: 'Выгрузить журнал заявок в Excel',
        description: 'Выгружаются только перечисленные заявки — ровно то, что отобрано на экране.',
    })
    async exportOrders(
        @Request() req: any,
        @Body() body: { orderIds?: string[] },
        @Res() res: Response,
    ) {
        const buffer = await this.ordersExport.exportOrders(
            req.user.companyId,
            body?.orderIds ?? [],
        );
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="orders_${new Date().toISOString().slice(0, 10)}.xlsx"`,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
        });
        res.end(buffer);
    }

    @Get('my')
    @Roles(UserRole.DRIVER)
    @ApiOperation({ summary: 'Мои заявки (для водителя); history=1 — включая завершённые' })
    async myOrders(@Request() req: any, @Query('history') history?: string) {
        return this.ordersService.findDriverOrders(req.user.sub, history === '1');
    }

    @Get(':id/power-of-attorney')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Скачать доверенность на водителя (PDF)' })
    async downloadPowerOfAttorney(
        @Param('id') id: string,
        @Request() req: any,
        @Res() res: Response,
        // Флажок «Подпись и печать»: по умолчанию документ чистый.
        @Query('withStamp') withStamp?: string,
    ) {
        const pdfBuffer = await this.poaService.generatePdf(id, req.user.companyId, {
            withStamp: withStamp === 'true',
        });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="POA_${id}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.end(pdfBuffer);
    }

    // Объявлено до `:id/...`, иначе путь съедается параметром.
    @Get('document-journal')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({
        summary: 'Журнал выданных доверенностей и договоров-заявок',
        description: 'Сформированные документы со снимком, включая прежние версии.',
    })
    listDocumentJournal(
        @Request() req: any,
        @Query('kind') kind?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.orderDocuments.listJournal(req.user.companyId, {
            kind: this.documentKind(kind),
            from,
            to,
        });
    }

    @Get('documents/:documentId/pdf')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Печать сохранённой версии документа по рейсу' })
    async downloadSavedDocument(
        @Param('documentId') documentId: string,
        @Request() req: any,
        @Res() res: Response,
        @Query('withStamp') withStamp?: string,
    ) {
        const pdfBuffer = await this.orderDocuments.printSaved(documentId, req.user.companyId, {
            withStamp: withStamp === 'true',
        });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Document_${documentId}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.end(pdfBuffer);
    }

    @Get(':id/documents')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Сформированные версии документа по рейсу' })
    listOrderDocuments(@Param('id') id: string, @Request() req: any, @Query('kind') kind?: string) {
        return this.orderDocuments.listForOrder(this.documentKind(kind), id, req.user.companyId);
    }

    @Post(':id/documents')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({
        summary: 'Сформировать документ по рейсу',
        description: 'Снимает данные заявки; прежние версии остаются в истории.',
    })
    async formOrderDocument(@Param('id') id: string, @Request() req: any, @Query('kind') kind?: string) {
        const documentKind = this.documentKind(kind);
        const document = await this.orderDocuments.form(documentKind, id, req.user.companyId, req.user.sub);
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'CREATE',
            entity: 'order_document',
            entityId: document.id,
            entityLabel: `${documentKind === 'CONTRACT' ? 'Договор-заявка' : 'Доверенность'} по рейсу, версия ${document.version}`,
            orderId: id,
        });
        return document;
    }

    /**
     * Провести документ: заверить и разрешить печать.
     *
     * Право «Бухгалтерия», потому что проведение — это ответ «в документе всё
     * верно, включая налоговую часть». Договор-заявку проводит бухгалтер;
     * доверенность проводить не нужно вовсе — в ней нет денег, и она целиком
     * остаётся за менеджером (см. `OrderDocumentsService.post`).
     */
    @Post('documents/:documentId/post')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.ACCOUNTANT, UserRole.LOGISTICIAN,
    )
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Провести документ по рейсу' })
    async postOrderDocument(@Param('documentId') documentId: string, @Request() req: any) {
        const document = await this.orderDocuments.post(documentId, req.user.companyId, req.user.sub);
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order_document',
            entityId: documentId,
            entityLabel: `Проведён: ${document.title}`,
            orderId: document.orderId,
        });
        return document;
    }

    /**
     * Отправить документ получателю.
     *
     * Отправлять может и менеджер, и бухгалтер: документ к этому моменту уже
     * проверен и заверен, дальше это обычная работа с контрагентом. Кому
     * отправлять, человек не выбирает — получатель записан в самом документе.
     */
    @Post('documents/:documentId/send')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Отправить документ по рейсу получателю' })
    async sendOrderDocument(
        @Param('documentId') documentId: string,
        @Request() req: any,
        @Body() body: { email?: string },
    ) {
        const result = await this.orderDocuments.send(
            documentId, req.user.companyId, req.user.sub, body?.email,
        );
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order_document',
            entityId: documentId,
            entityLabel: `Отправлен: ${result.title} → ${result.sentTo}`,
            orderId: result.orderId,
        });
        return result;
    }

    /** Кому уйдёт документ и можно ли его отправить прямо сейчас. */
    @Get('documents/:documentId/delivery')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN, UserRole.ACCOUNTANT)
    @ApiOperation({ summary: 'Куда уйдёт документ по рейсу' })
    deliveryOfOrderDocument(@Param('documentId') documentId: string, @Request() req: any) {
        return this.orderDocuments.deliveryTarget(documentId, req.user.companyId);
    }

    /** Вид документа из строки запроса; по умолчанию — доверенность. */
    private documentKind(kind?: string): OrderDocumentKind {
        return kind === 'CONTRACT' ? OrderDocumentKind.CONTRACT : OrderDocumentKind.POWER_OF_ATTORNEY;
    }

    // ─── Расчёты по рейсу: НДС и сроки оплаты ───

    @Get(':id/settlements')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.LOGISTICIAN, UserRole.ACCOUNTANT,
    )
    @ApiOperation({ summary: 'Условия расчётов по рейсу и их проверка' })
    settlementsOf(@Param('id') id: string, @Request() req: any) {
        return this.settlements.stateOf(id, req.user.companyId);
    }

    @Put(':id/settlements')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.ACCOUNTANT, UserRole.LOGISTICIAN,
    )
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Исправить условия расчётов по рейсу' })
    async patchSettlements(@Param('id') id: string, @Request() req: any, @Body() dto: {
        hasVat?: boolean;
        vatRate?: number | null;
        executorHasVat?: boolean;
        executorVatRate?: number | null;
        customerPaymentDays?: number | null;
        customerPaymentFrom?: string | null;
        carrierPaymentDays?: number | null;
        carrierPaymentFrom?: string | null;
    }) {
        const state = await this.settlements.patchTerms(id, req.user.companyId, req.user.sub, dto);
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: 'Условия расчётов по рейсу',
            orderId: id,
        });
        return state;
    }

    /**
     * Отметить, что оригиналы накладных дошли.
     *
     * Без права «Бухгалтерия»: получить конверт от перевозчика и убедиться,
     * что заказчик его получил, — обычная работа с документами. Бухгалтеру
     * принадлежит другое — сколько дней отсрочки и от какого события их
     * считать; отметка лишь сообщает платформе, что событие наступило.
     */
    @Post(':id/originals')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.LOGISTICIAN, UserRole.ACCOUNTANT,
    )
    @ApiOperation({ summary: 'Отметить получение оригиналов накладных' })
    async markOriginals(@Param('id') id: string, @Request() req: any, @Body() dto: {
        side?: string;
        date?: string | null;
    }) {
        // Сторону выбирают явно: у оригиналов от перевозчика и оригиналов у
        // заказчика разные даты и разные деньги, и угадывать здесь нечего.
        const side = String(dto?.side || '').toLowerCase();
        if (side !== 'carrier' && side !== 'customer') {
            throw new BadRequestException('Укажите, чьи оригиналы отмечаете: CARRIER или CUSTOMER');
        }
        const state = await this.settlements.markOriginals(
            id, req.user.companyId, side, dto?.date ?? null,
        );
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: side === 'carrier'
                ? (dto?.date ? 'Оригиналы получены от перевозчика' : 'Снята отметка об оригиналах от перевозчика')
                : (dto?.date ? 'Заказчик получил оригиналы' : 'Снята отметка о получении оригиналов заказчиком'),
            orderId: id,
        });
        return state;
    }

    @Post(':id/settlements/confirm')
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.FORWARDER,
        UserRole.ACCOUNTANT, UserRole.LOGISTICIAN,
    )
    @RequirePermissions('accounting')
    @ApiOperation({ summary: 'Подтвердить расчёты по рейсу как есть' })
    async confirmSettlements(@Param('id') id: string, @Request() req: any) {
        const state = await this.settlements.confirm(id, req.user.companyId, req.user.sub);
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: 'Расчёты по рейсу подтверждены',
            orderId: id,
        });
        return state;
    }

    @Get(':id/contract')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({
        summary: 'Скачать договор-заявку на перевозку (PDF)',
        description: 'Печать «на лету» из текущих данных заявки — всегда без печати и подписи.',
    })
    async downloadContract(
        @Param('id') id: string,
        @Request() req: any,
        @Res() res: Response,
        @Query('withStamp') withStamp?: string,
    ) {
        // Заверить можно только сформированную и проведённую версию.
        //
        // Этот путь печатает «живые» данные заявки, которые меняются каждый
        // час. Печать на таком листе означала бы, что компания отвечает за
        // содержимое, которого через минуту уже нет.
        if (withStamp === 'true') {
            throw new BadRequestException(
                'Договор-заявку с печатью выдаёт проведённая версия документа. '
                + 'Сформируйте её во вкладке «Документы».',
            );
        }
        const pdfBuffer = await this.contractService.generatePdf(id, req.user.companyId, {
            withStamp: false,
        });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Contract_${id}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.end(pdfBuffer);
    }

    @Post(':id/share-power-of-attorney')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отправить доверенность по email получателям' })
    async sharePowerOfAttorney(
        @Param('id') id: string,
        @Body() body: { emails: string[] },
        @Request() req: any,
    ) {
        if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
            throw new BadRequestException('Не указаны email-адреса для рассылки');
        }

        const order = await this.ordersService.findById(id, {
            userId: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });
        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        // Fetch sender's company name
        const company = req.user.companyId
            ? await this.prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true } })
            : null;
        const senderCompanyName = company?.name || 'LogiCore';

        // Generate the PDF buffer
        const pdfBuffer = await this.poaService.generatePdf(id, req.user.companyId);

        // Собираем ключевые данные водителя для отображения в письме
        const driver = (order as any).driver;
        const routePoints = (order as any).routePoints || [];
        const pickupPoint = routePoints.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const deliveryPoint = routePoints.find((p: any) => p.pointType === 'DELIVERY');
        const pickupCity = pickupPoint?.location?.city || pickupPoint?.location?.address || '';
        const deliveryCity = deliveryPoint?.location?.city || deliveryPoint?.location?.address || '';

        const driverInfo = {
            fullName: driver
                ? `${driver.lastName || ''} ${driver.firstName || ''} ${driver.middleName || ''}`.trim()
                : ((order as any).assignedDriverName || undefined),
            vehicleModel: driver?.vehicleModel || undefined,
            vehiclePlate: driver?.vehiclePlate || (order as any).assignedDriverPlate || undefined,
            phone: driver?.phone || (order as any).assignedDriverPhone || undefined,
            route: (pickupCity && deliveryCity) ? `${pickupCity} → ${deliveryCity}` : undefined,
        };

        // Send emails in parallel
        await Promise.all(
            body.emails.map(email =>
                this.emailService.sendPowerOfAttorneyEmail(email, order.orderNumber, senderCompanyName, pdfBuffer, driverInfo)
            )
        );

        return { success: true, message: 'Доверенность успешно отправлена на указанные адреса' };
    }

    @Get(':id')
    // Бухгалтер и завскладом открывают карточку по той же причине, по которой
    // видят список: иначе раздел «Заявки» открывается пустым, а строка не
    // кликается. Право `orders` требуется на уровне контроллера.
    @Roles(
        UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER,
        UserRole.DRIVER, UserRole.ACCOUNTANT, UserRole.WAREHOUSE_MANAGER,
    )
    @ApiOperation({ summary: 'Получить заявку по ID' })
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.findById(id, {
            userId: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });
    }

    @Put(':id/assign')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Назначить водителя на заявку' })
    async assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
        return this.ordersService.assignDriver(id, dto.driverId, dto.partnerId, {
            assignedDriverName: dto.assignedDriverName,
            assignedDriverPhone: dto.assignedDriverPhone,
            assignedDriverPlate: dto.assignedDriverPlate,
            assignedDriverTrailer: dto.assignedDriverTrailer,
        });
    }

    @Get(':id/history')
    @ApiOperation({ summary: 'История рейса: смены статуса и действия людей одной лентой' })
    async history(@Param('id') id: string, @Request() req: any) {
        // Через findById, чтобы права на заявку проверялись ровно так же, как
        // при её открытии: историю видит тот, кто видит сам рейс.
        await this.ordersService.findById(id, {
            userId: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });
        return this.auditService.getOrderHistory(id);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Обновить заявку' })
    async update(@Param('id') id: string, @Body() dto: Partial<CreateOrderDto>, @Request() req: any) {
        // Бухгалтерские поля этим путём не проходят.
        //
        // Форма заявки их менеджеру больше не показывает, но запрос можно
        // отправить и без формы. Раньше именно так и работало: «НДС» стоял в
        // общей правке рейса, по умолчанию снятый, и уходил в договор с
        // печатью. Кто вправе их менять — решает право «Бухгалтерия», а сами
        // правки идут отдельной ручкой ниже, где остаётся след.
        if (!canTouchAccounting(req.user)) {
            for (const field of ACCOUNTING_ORDER_FIELDS) {
                delete (dto as any)[field];
            }
        }

        const updated = await this.ordersService.update(id, {
            ...dto,
            customerPaymentDate: dto.customerPaymentDate ? new Date(dto.customerPaymentDate) : undefined,
            driverPaymentDate: dto.driverPaymentDate ? new Date(dto.driverPaymentDate) : undefined,
        }, {
            id: req.user.sub,
            role: req.user.role,
            companyId: req.user.companyId,
        });

        // Журналируем денежные поля — самое частое поле споров
        const moneyChanges: Record<string, any> = {};
        if (dto.customerPrice !== undefined) moneyChanges.customerPrice = dto.customerPrice;
        if (dto.driverCost !== undefined) moneyChanges.driverCost = dto.driverCost;
        if ((dto as any).subForwarderPrice !== undefined) moneyChanges.subForwarderPrice = (dto as any).subForwarderPrice;
        await this.auditService.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'UPDATE',
            entity: 'order',
            entityId: id,
            entityLabel: `Заявка №${(updated as any)?.orderNumber || id}`,
            details: Object.keys(moneyChanges).length ? moneyChanges : null,
            orderId: id,
        });

        return updated;
    }

    @Put(':id/status')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Обновить статус заявки' })
    async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Request() req: any) {
        const result = await this.ordersService.updateStatus(id, dto.status, dto.comment, req.user.sub, req.user.companyId, req.user.role);

        // В журнал — только критичные переходы (отмена/проблема); рутинные статусы пишет OrderStatusHistory
        if (dto.status === 'CANCELLED' || dto.status === 'PROBLEM') {
            await this.auditService.log({
                companyId: req.user.companyId,
                user: req.user,
                action: 'STATUS',
                entity: 'order',
                entityId: id,
                entityLabel: `Заявка №${(result as any)?.orderNumber || id}`,
                details: { status: dto.status, comment: dto.comment ?? null },
                orderId: id,
            });
        }

        return result;
    }

    @Put(':id/confirm-completion')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Подтвердить завершение рейса' })
    async confirmCompletion(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.confirmCompletion(id, req.user.companyId, req.user.sub);
    }

    @Put(':id/reject-completion')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отклонить завершение рейса' })
    async rejectCompletion(
        @Param('id') id: string,
        @Body() body: { reason?: string },
        @Request() req: any
    ) {
        return this.ordersService.rejectCompletion(id, req.user.companyId, req.user.sub, body.reason);
    }

    @Put(':id/cancel-completion')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER)
    @ApiOperation({ summary: 'Отменить запрос на завершение рейса' })
    async cancelCompletionRequest(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.cancelCompletionRequest(id, req.user.companyId, req.user.sub);
    }

    @Post(':id/problem')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.DRIVER)
    @ApiOperation({ summary: 'Сообщить о проблеме' })
    async reportProblem(
        @Param('id') id: string,
        @Body() dto: { description: string },
        @Request() req: any
    ) {
        return this.ordersService.reportProblem(id, dto.description, req.user.sub);
    }

    @Post(':id/delivery-point')
    @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN)
    @ApiOperation({ summary: 'Добавить точку выгрузки' })
    async addDeliveryPoint(
        @Param('id') id: string,
        @Body() dto: { locationId: string; notes?: string },
        @Request() req: any,
    ) {
        return this.ordersService.addDeliveryPoint(id, dto.locationId, dto.notes, req.user);
    }
}