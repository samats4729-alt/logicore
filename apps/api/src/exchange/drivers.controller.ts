import {
    Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Request, Res, UploadedFile, UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { AllowWithoutCompany, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { AuthService } from '../auth/auth.service';
import { setAuthCookie } from '../auth/auth-cookie';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../s3/s3.service';
import { MAX_UPLOAD_SIZE } from '../documents/allowed-files';
import { exchangeEnabled, ExchangeEnabledGuard } from './exchange-enabled.guard';
import { ExchangeCompanyAccessGuard } from './exchange-access';
import { ExchangeDriverLoadsService } from './driver-loads.service';
import { ExchangeOffersService } from './exchange-offers.service';
import { ExchangeParkService } from './park.service';
import { ExchangePayoutsService } from './payouts.service';
import { MakeOfferDto } from './dto/exchange-order.dto';
import { ExchangeDriversService } from './drivers.service';
import { sendExchangeFile } from './exchange-files';
import { ParkContractService } from './park-contract.service';
import { ExchangeFuelService } from './fuel.service';
import { ExchangeSettlementService } from './settlement.service';
import { ExchangeParkRegistryService } from './park-registry.service';
import { ExchangeParkEarningsService } from './park-earnings.service';
import { PlatformFeeDto } from './dto/fuel.dto';
import { FuelDecisionDto, FuelIssueDto, FuelReceiptDto } from './dto/fuel.dto';

/**
 * Отдать PDF договора. В браузере телефона — открыть на месте, а не
 * скачивать молча (`inline`); в кабинете — скачать файлом.
 */
function sendContractPdf(res: Response, file: { number: string; pdf: Buffer }, inline: boolean) {
    const name = `Договор ${file.number}.pdf`;
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
    });
    res.send(file.pdf);
}
import {
    AdminCompaniesQueryDto, ParkEarningsQueryDto, DriverDocumentDto, DriverFeedQueryDto, DriverGoogleAuthDto, DriverPhoneRegisterDto, DriverReasonDto, ParkDriversQueryDto,
    ConfirmRatesDto, DeductionRequestDto, DeletionRequestDto, ExportPayoutsDto, FuelSeasonDto, ParkCodeDto, ParkPayoutsQueryDto, PreliminaryAckDto, ParkTripsQueryDto, PayoutAccountDto, PayoutRatesDto, SetExchangeAccessDto, SetParkDto, UpdateDriverProfileDto,
} from './dto/driver.dto';

const LOGIN_ATTEMPTS_PER_MINUTE = Number(process.env.AUTH_THROTTLE_LIMIT) || 5;

/**
 * Вход водителя биржи через Google. Открыт без логина — это и есть вход.
 * Замок — проверка токена у Google: без настоящего входа в Google сюда не
 * попасть. Перечислен в auth/open-routes.spec.ts.
 */
@ApiTags('exchange-drivers')
@Controller('exchange/driver/auth')
@UseGuards(ExchangeEnabledGuard)
export class ExchangeDriverAuthController {
    constructor(
        private readonly drivers: ExchangeDriversService,
        private readonly auth: AuthService,
    ) {}

    @Post('google')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вход водителя биржи через Google' })
    async google(@Body() dto: DriverGoogleAuthDto, @Res({ passthrough: true }) response: Response) {
        const profile = await this.auth.googleProfile(dto.token);
        await this.drivers.ensureDriverUser(profile);
        const result = await this.auth.loginWithGoogle(dto.token, dto.deviceId);
        if ('accessToken' in result && result.accessToken) setAuthCookie(response, result.accessToken);
        return result;
    }

    /**
     * Регистрация водителя биржи по номеру и паролю. Пока без СМС: номер
     * проверяет парк звонком перед допуском (см. registerByPhone). Дальше
     * человек входит обычным входом водителя — по номеру и паролю.
     */
    @Post('phone/register')
    @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Регистрация водителя биржи по номеру телефона' })
    async registerByPhone(@Body() dto: DriverPhoneRegisterDto, @Res({ passthrough: true }) response: Response) {
        const user = await this.drivers.registerByPhone(dto);
        const accessToken = await this.auth.issueSession(user.id, { sub: user.id, email: null, role: user.role, companyId: null }, dto.deviceId);
        setAuthCookie(response, accessToken);
        const { passwordHash: _hidden, ...safeUser } = user;
        return { accessToken, user: safeUser };
    }
}

/** Анкета водителя — из приложения. Компании у такого водителя нет. */
@ApiTags('exchange-drivers')
@Controller('exchange/driver')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, RolesGuard)
@AllowWithoutCompany()
@Roles(UserRole.DRIVER)
@ApiBearerAuth()
export class ExchangeDriverController {
    constructor(
        private readonly drivers: ExchangeDriversService,
        private readonly loads: ExchangeDriverLoadsService,
        private readonly offers: ExchangeOffersService,
        private readonly payouts: ExchangePayoutsService,
        private readonly s3: S3Service,
        private readonly contracts: ParkContractService,
        private readonly fuel: ExchangeFuelService,
    ) {}

    // ==================== топливо рейса ====================
    // Водитель доезжает до заправки, звонит в парк, чек пробивают на БИН парка —
    // здесь он видит БИН, сколько парк дал на топливо и сколько ему останется,
    // и отправляет фото чека с суммой.

    @Get('trips/:orderId/fuel')
    @ApiOperation({ summary: 'Топливо рейса: БИН парка, выдано, чеки, сколько останется' })
    tripFuel(@Request() req: any, @Param('orderId') orderId: string) {
        return this.fuel.forDriver(req.user.sub, orderId);
    }

    @Post('trips/:orderId/fuel/receipts')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE } }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Чек на топливо: фото и сумма' })
    addFuelReceipt(@Request() req: any, @Param('orderId') orderId: string, @Body() dto: FuelReceiptDto, @UploadedFile() file: Express.Multer.File) {
        return this.fuel.addReceipt(req.user.sub, orderId, dto.amount, file);
    }

    @Delete('fuel-receipts/:id')
    @ApiOperation({ summary: 'Убрать свой чек, пока парк его не рассмотрел' })
    removeFuelReceipt(@Request() req: any, @Param('id') id: string) {
        return this.fuel.removeReceipt(req.user.sub, id);
    }

    @Get('fuel-receipts/:id/file')
    @ApiOperation({ summary: 'Фото своего чека' })
    async fuelReceiptFile(@Request() req: any, @Param('id') id: string, @Res() res: Response) {
        return sendExchangeFile(this.s3, res, await this.fuel.driverReceiptFile(req.user.sub, id));
    }

    @Get('me')
    @ApiOperation({ summary: 'Моя анкета водителя' })
    me(@Request() req: any) {
        return this.drivers.me(req.user.sub);
    }

    @Put('me')
    @ApiOperation({ summary: 'Заполнить анкету' })
    update(@Request() req: any, @Body() dto: UpdateDriverProfileDto) {
        return this.drivers.update(req.user.sub, dto);
    }

    @Get('parks')
    @ApiOperation({ summary: 'Парки биржи — для выбора в анкете' })
    parks() {
        return this.drivers.parks();
    }

    @Post('me/documents')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE } }))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Фото документа' })
    addDocument(@Request() req: any, @Body() dto: DriverDocumentDto, @UploadedFile() file: Express.Multer.File) {
        return this.drivers.addDocument(req.user.sub, dto.kind, file);
    }

    @Delete('me/documents/:id')
    @ApiOperation({ summary: 'Убрать фото документа' })
    removeDocument(@Request() req: any, @Param('id') id: string) {
        return this.drivers.removeDocument(req.user.sub, id);
    }

    @Get('me/documents/:id')
    @ApiOperation({ summary: 'Своё фото документа' })
    async document(@Request() req: any, @Param('id') id: string, @Res() res: Response) {
        return sendExchangeFile(this.s3, res, await this.drivers.ownDocument(req.user.sub, id));
    }

    @Get('me/contract')
    @ApiOperation({ summary: 'Договор с парком: подписанный экземпляр или текст к подписи' })
    contract(@Request() req: any) {
        return this.drivers.contract(req.user.sub);
    }

    @Get('me/contract/pdf')
    @ApiOperation({ summary: 'PDF своего подписанного договора' })
    async contractPdf(@Request() req: any, @Res() res: Response) {
        sendContractPdf(res, await this.contracts.driverPdf(req.user.sub), false);
    }

    @Post('me/contract/link')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Ссылка на PDF договора на десять минут — открыть в браузере телефона' })
    contractLink(@Request() req: any) {
        return this.contracts.driverLink(req.user.sub);
    }

    @Post('me/sign-contract')
    @ApiOperation({ summary: 'Подписать договор с парком' })
    signContract(@Request() req: any) {
        const deviceId = req.headers['x-device-id'] as string | undefined;
        const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip;
        return this.drivers.signContract(req.user.sub, deviceId, ip);
    }

    @Post('me/submit')
    @ApiOperation({ summary: 'Отправить анкету' })
    submit(@Request() req: any) {
        return this.drivers.submit(req.user.sub);
    }

    @Post('me/park-code')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вступить в парк по коду приглашения' })
    joinPark(@Request() req: any, @Body() dto: ParkCodeDto) {
        return this.drivers.joinParkByCode(req.user.sub, dto.code);
    }

    @Get('earnings')
    @ApiOperation({ summary: 'Заработок: к выплате, удержания, история выплат' })
    earnings(@Request() req: any) {
        return this.payouts.earnings(req.user.sub);
    }

    @Put('me/payout-account')
    @ApiOperation({ summary: 'Счёт для выплат (IBAN)' })
    setPayoutAccount(@Request() req: any, @Body() dto: PayoutAccountDto) {
        return this.payouts.setAccount(req.user.sub, dto);
    }

    @Post('payouts/request')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Запросить выплату за довезённые рейсы' })
    requestPayout(@Request() req: any) {
        return this.payouts.request(req.user.sub);
    }

    @Post('me/reopen')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Вернуть принятую анкету на правку (сменилась машина, телефон)' })
    reopen(@Request() req: any) {
        return this.drivers.reopen(req.user.sub);
    }

    @Post('me/delete')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Попросить удалить аккаунт — удаляет администратор' })
    deleteAccount(@Request() req: any, @Body() dto: DeletionRequestDto) {
        return this.drivers.requestDeletion(req.user.sub, dto?.reason);
    }

    @Post('me/delete/cancel')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Отозвать просьбу удалить аккаунт' })
    cancelDeletion(@Request() req: any) {
        return this.drivers.cancelDeletion(req.user.sub);
    }

    @Put('me/deduction')
    @ApiOperation({ summary: 'Заявление на базовый вычет по ИПН — у другого работодателя не получаю' })
    setDeduction(@Request() req: any, @Body() dto: DeductionRequestDto) {
        return this.drivers.setDeduction(req.user.sub, dto.requested);
    }

    // ==================== биржа ====================

    @Get('loads')
    @ApiOperation({ summary: 'Лента: заявки на бирже' })
    async feed(@Request() req: any, @Query() query: DriverFeedQueryDto) {
        const [list, offered] = await Promise.all([
            this.loads.feed(req.user.sub, query.bodyType),
            this.offers.driverOfferStatuses(req.user.sub),
        ]);
        return list.map((o) => ({ ...o, myOfferStatus: offered[o.id] ?? null }));
    }

    @Get('loads/:id')
    @ApiOperation({ summary: 'Заявка с биржи' })
    async load(@Request() req: any, @Param('id') id: string) {
        const card = await this.loads.card(req.user.sub, id);
        return { ...card, myOffer: await this.offers.driverOffer(req.user.sub, id) };
    }

    @Post('loads/:id/offer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Откликнуться: согласен на цену или своя цена' })
    offer(@Request() req: any, @Param('id') id: string, @Body() dto: MakeOfferDto) {
        return this.offers.offerAsDriver(req.user.sub, id, dto);
    }

    @Post('loads/:id/offer/withdraw')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Отозвать свой отклик' })
    withdraw(@Request() req: any, @Param('id') id: string) {
        return this.offers.withdrawAsDriver(req.user.sub, id);
    }

    @Get('offers')
    @ApiOperation({ summary: 'Мои отклики' })
    myOffers(@Request() req: any) {
        return this.offers.driverOffers(req.user.sub);
    }
}

/**
 * Включена ли биржа — до входа. Приложению водителя нужно решить, показывать
 * ли «Войти через Google», ещё на экране входа. Открыт без логина: отдаёт
 * одно да/нет. Перечислен в auth/open-routes.spec.ts.
 */
@ApiTags('exchange-drivers')
@Controller('exchange')
export class ExchangePublicController {
    constructor(
        private readonly park: ExchangeParkService,
        private readonly contracts: ParkContractService,
    ) {}

    /**
     * PDF договора по ссылке из приложения: браузер телефона пропуск
     * водителя не пошлёт. Замок — подпись ссылки секретом сервера и срок в
     * десять минут (`ParkContractService.driverLink`). Перечислен в
     * auth/open-routes.spec.ts.
     */
    @Get('contract-pdf/:token')
    @UseGuards(ExchangeEnabledGuard)
    @ApiOperation({ summary: 'PDF договора водителя по ссылке на десять минут (без входа)' })
    async contractPdf(@Param('token') token: string, @Res() res: Response) {
        sendContractPdf(res, await this.contracts.pdfByLink(token), true);
    }

    @Get('public-status')
    @ApiOperation({ summary: 'Включена ли биржа (без входа)' })
    status() {
        return { enabled: exchangeEnabled() };
    }

    /**
     * Чьё приглашение — для страницы, которую водитель открывает по ссылке
     * из WhatsApp, ещё без приложения. Отдаёт только название парка.
     * Перечислен в auth/open-routes.spec.ts.
     */
    @Get('park-invite/:code')
    @UseGuards(ExchangeEnabledGuard)
    @ApiOperation({ summary: 'Чьё приглашение (без входа)' })
    invite(@Param('code') code: string) {
        return this.park.inviteInfo(code);
    }
}

/**
 * Водители парка — кабинет компании-парка. Права — как у биржи (заявки),
 * и сверх того компания обязана быть парком: это проверяет сервис.
 */
@ApiTags('exchange-drivers')
@Controller('exchange/park')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, ExchangeCompanyAccessGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('orders')
@Roles(UserRole.COMPANY_ADMIN, UserRole.FORWARDER, UserRole.LOGISTICIAN)
@ApiBearerAuth()
export class ExchangeParkController {
    constructor(
        private readonly drivers: ExchangeDriversService,
        private readonly park: ExchangeParkService,
        private readonly payouts: ExchangePayoutsService,
        private readonly s3: S3Service,
        private readonly audit: AuditService,
        private readonly contracts: ParkContractService,
        private readonly fuel: ExchangeFuelService,
        private readonly registry: ExchangeParkRegistryService,
    ) {}

    @Get('overview')
    @ApiOperation({ summary: 'Кабинет парка: водители, рейсы, заработок за месяц, код приглашения' })
    overview(@Request() req: any) {
        return this.park.overview(req.user.companyId);
    }

    @Get('trips')
    @ApiOperation({ summary: 'Рейсы водителей парка' })
    trips(@Request() req: any, @Query() query: ParkTripsQueryDto) {
        return this.park.trips(req.user.companyId, query.status);
    }

    // ==================== топливо рейса ====================

    @Get('trips/:orderId/fuel')
    @ApiOperation({ summary: 'Топливо рейса: выдано на топливо, чеки водителя, к выплате' })
    async tripFuel(@Request() req: any, @Param('orderId') orderId: string) {
        await this.drivers.assertPark(req.user.companyId);
        return this.fuel.forPark(req.user.companyId, orderId);
    }

    @Post('trips/:orderId/fuel/issues')
    @ApiOperation({ summary: 'Дали на топливо: оплатили на заправке или перевели водителю' })
    async addFuelIssue(@Request() req: any, @Param('orderId') orderId: string, @Body() dto: FuelIssueDto) {
        await this.drivers.assertPark(req.user.companyId);
        return this.fuel.addIssue(req.user.companyId, req.user.sub, orderId, dto);
    }

    @Delete('fuel-issues/:id')
    @ApiOperation({ summary: 'Убрать запись «дали на топливо» — внесли по ошибке' })
    async removeFuelIssue(@Request() req: any, @Param('id') id: string) {
        await this.drivers.assertPark(req.user.companyId);
        return this.fuel.removeIssue(req.user.companyId, id);
    }

    @Put('fuel-receipts/:id/decision')
    @ApiOperation({ summary: 'Чек водителя: принять (можно поправить сумму) или отклонить с причиной' })
    async decideFuelReceipt(@Request() req: any, @Param('id') id: string, @Body() dto: FuelDecisionDto) {
        await this.drivers.assertPark(req.user.companyId);
        return this.fuel.decideReceipt(req.user.companyId, req.user.sub, id, dto);
    }

    @Get('fuel-receipts/:id/file')
    @ApiOperation({ summary: 'Фото чека водителя' })
    async fuelReceiptFile(@Request() req: any, @Param('id') id: string, @Res() res: Response) {
        await this.drivers.assertPark(req.user.companyId);
        return sendExchangeFile(this.s3, res, await this.fuel.parkReceiptFile(req.user.companyId, id));
    }

    // ==================== реестр бухгалтера ====================

    @Get('registry')
    @ApiOperation({ summary: 'Реестр бухгалтера за месяц: рейсы, начислено, удержано, в бюджет, выплачено' })
    registryMonth(@Request() req: any, @Query('month') month?: string) {
        return this.registry.month(req.user.companyId, month);
    }

    @Get('registry/export')
    @ApiOperation({ summary: 'Реестр бухгалтера за месяц — Excel' })
    async registryExport(@Request() req: any, @Res() res: Response, @Query('month') month?: string) {
        const { buffer, month: m } = await this.registry.export(req.user.companyId, month);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="registry_${m}.xlsx"`,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
        });
        res.end(buffer);
    }

    @Get('payouts')
    @ApiOperation({ summary: 'Выплаты водителям парка' })
    payoutsList(@Request() req: any, @Query() query: ParkPayoutsQueryDto) {
        return this.payouts.parkPayouts(req.user.companyId, query.status);
    }

    @Get('payouts/:id')
    @ApiOperation({ summary: 'Выплата по рейсам' })
    payout(@Request() req: any, @Param('id') id: string) {
        return this.payouts.parkPayout(req.user.companyId, id);
    }

    @Post('payouts/export')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Реестр выплат для 1С (Excel); выгруженные — «в 1С»' })
    async exportPayouts(@Request() req: any, @Body() dto: ExportPayoutsDto, @Res() res: Response) {
        const { buffer, count } = await this.payouts.exportFor1C(req.user.companyId, dto.ids, !!dto.preliminaryAck);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'STATUS', entity: 'driver_payout',
            entityLabel: `Реестр выплат водителям для 1С: ${count}`,
        });
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="payouts_${new Date().toISOString().slice(0, 10)}.xlsx"`,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
        });
        res.end(buffer);
    }

    @Post('payouts/:id/paid')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Отметить выплату проведённой' })
    async markPaid(@Request() req: any, @Param('id') id: string, @Body() dto: PreliminaryAckDto) {
        const result = await this.payouts.markPaid(req.user.companyId, id, req.user.sub, !!dto?.preliminaryAck);
        await this.audit.log({ companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'driver_payout', entityId: id, entityLabel: 'Выплата водителю отмечена выплаченной' });
        return result;
    }

    @Post('payouts/:id/reject')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Отклонить выплату с причиной' })
    async rejectPayout(@Request() req: any, @Param('id') id: string, @Body() dto: DriverReasonDto) {
        const result = await this.payouts.reject(req.user.companyId, id, req.user.sub, dto.reason);
        await this.audit.log({ companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'driver_payout', entityId: id, entityLabel: `Выплата водителю отклонена: ${dto.reason}` });
        return result;
    }

    @Get('rates')
    @ApiOperation({ summary: 'Ставки удержаний парка' })
    rates(@Request() req: any) {
        return this.payouts.parkRates(req.user.companyId);
    }

    @Put('rates')
    @ApiOperation({ summary: 'Изменить ставки удержаний' })
    async setRates(@Request() req: any, @Body() dto: PayoutRatesDto) {
        const result = await this.payouts.setRates(req.user.companyId, req.user.sub, dto);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'park_rates',
            entityLabel: `Ставки выплат: комиссия ${dto.commissionPct}%, ОПВ ${dto.opvPct}%, ВОСМС ${dto.vosmsPct}%, ИПН ${dto.ipnPct}%, СО ${dto.soPct}%${dto.vatPayer ? `, НДС ${dto.vatPct ?? 16}%` : ''}`,
        });
        return result;
    }

    @Put('rates/season')
    @ApiOperation({ summary: 'Лето или зима — цена литра для расчёта топлива' })
    async setSeason(@Request() req: any, @Body() dto: FuelSeasonDto) {
        const result = await this.payouts.setFuelSeason(req.user.companyId, req.user.sub, dto.season);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'park_rates',
            entityLabel: `Топливо: ${dto.season === 'WINTER' ? 'зимняя' : 'летняя'} цена`,
        });
        return result;
    }

    @Put('rates/confirm')
    @ApiOperation({ summary: 'Бухгалтер парка подтверждает ставки и порядок расчёта (или снимает подтверждение)' })
    async confirmRates(@Request() req: any, @Body() dto: ConfirmRatesDto) {
        const result = await this.payouts.confirmRates(req.user.companyId, req.user.sub, dto.confirmed);
        await this.audit.log({
            companyId: req.user.companyId, user: req.user, action: 'UPDATE', entity: 'park_rates',
            entityLabel: dto.confirmed ? 'Бухгалтер подтвердил расчёт выплат водителям' : 'Подтверждение расчёта выплат снято',
        });
        return result;
    }

    @Post('invite/regenerate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Новый код приглашения — старый перестаёт работать' })
    async regenerate(@Request() req: any) {
        return { inviteCode: await this.park.regenerateCode(req.user.companyId) };
    }

    @Get('drivers')
    @ApiOperation({ summary: 'Водители парка' })
    list(@Request() req: any, @Query() query: ParkDriversQueryDto) {
        return this.drivers.parkDrivers(req.user.companyId, query.status);
    }

    @Get('drivers/:id')
    @ApiOperation({ summary: 'Анкета водителя' })
    card(@Request() req: any, @Param('id') id: string) {
        return this.drivers.parkDriverCard(req.user.companyId, id);
    }

    @Get('documents/:id')
    @ApiOperation({ summary: 'Фото документа водителя' })
    async document(@Request() req: any, @Param('id') id: string, @Res() res: Response) {
        return sendExchangeFile(this.s3, res, await this.drivers.parkDocument(req.user.companyId, id));
    }

    @Get('drivers/:id/contract/pdf')
    @ApiOperation({ summary: 'PDF подписанного договора с водителем' })
    async contractPdf(@Request() req: any, @Param('id') id: string, @Res() res: Response) {
        sendContractPdf(res, await this.contracts.parkPdf(req.user.companyId, id), false);
    }

    private async log(req: any, driver: { id: string; lastName: string | null; firstName: string | null }, what: string) {
        await this.audit.log({
            companyId: req.user.companyId,
            user: req.user,
            action: 'STATUS',
            entity: 'exchange_driver',
            entityId: driver.id,
            entityLabel: `${[driver.lastName, driver.firstName].filter(Boolean).join(' ') || 'Водитель'}: ${what}`,
        });
    }

    @Post('drivers/:id/approve')
    @ApiOperation({ summary: 'Допустить к грузам' })
    async approve(@Request() req: any, @Param('id') id: string) {
        const driver = await this.drivers.approve(req.user.companyId, id, req.user.sub);
        await this.log(req, driver, 'допущен к грузам');
        return driver;
    }

    @Post('drivers/:id/reject')
    @ApiOperation({ summary: 'Отказать' })
    async reject(@Request() req: any, @Param('id') id: string, @Body() dto: DriverReasonDto) {
        const driver = await this.drivers.reject(req.user.companyId, id, req.user.sub, dto.reason);
        await this.log(req, driver, `отказ — ${dto.reason}`);
        return driver;
    }

    @Post('drivers/:id/block')
    @ApiOperation({ summary: 'Заблокировать за обман' })
    async block(@Request() req: any, @Param('id') id: string, @Body() dto: DriverReasonDto) {
        const driver = await this.drivers.block(req.user.companyId, id, req.user.sub, dto.reason);
        await this.log(req, driver, `заблокирован — ${dto.reason}`);
        return driver;
    }
}

/** Владелец платформы назначает парки. */
@ApiTags('exchange-drivers')
@Controller('exchange/admin')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ExchangeAdminController {
    constructor(
        private readonly drivers: ExchangeDriversService,
        private readonly settlement: ExchangeSettlementService,
        private readonly loads: ExchangeDriverLoadsService,
        private readonly earnings: ExchangeParkEarningsService,
    ) {}

    @Get('park-earnings')
    @ApiOperation({ summary: 'Заработок LogiCore по паркам: рейсы, сумма перевозок, доля LogiCore, подписка' })
    parkEarnings(@Query() query: ParkEarningsQueryDto) {
        return this.earnings.summary(query);
    }

    @Get('park-earnings/:parkId')
    @ApiOperation({ summary: 'История начислений по парку: рейсы с долей LogiCore и оплаты подписки' })
    parkEarningsHistory(@Param('parkId') parkId: string, @Query() query: ParkEarningsQueryDto) {
        return this.earnings.history(parkId, query);
    }

    @Get('deletion-requests')
    @ApiOperation({ summary: 'Водители, которые просят удалить аккаунт' })
    deletionRequests() {
        return this.drivers.deletionRequests();
    }

    @Post('drivers/:id/delete')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Удалить аккаунт водителя по его просьбе' })
    async approveDeletion(@Param('id') id: string) {
        return this.loads.deleteAccount(await this.drivers.driverUserId(id));
    }

    @Post('drivers/:id/delete/decline')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Снять просьбу об удалении (водитель передумал)' })
    declineDeletion(@Param('id') id: string) {
        return this.drivers.declineDeletion(id);
    }

    @Get('platform-fee')
    @ApiOperation({ summary: 'Комиссия LogiCore с рейса водителя парка, %' })
    async platformFee() {
        return { platformPct: await this.settlement.platformPct() };
    }

    @Put('platform-fee')
    @ApiOperation({ summary: 'Поменять комиссию LogiCore — действует на новые отклики' })
    async setPlatformFee(@Body() dto: PlatformFeeDto) {
        return { platformPct: await this.settlement.setPlatformPct(dto.platformPct) };
    }

    @Get('companies')
    @ApiOperation({ summary: 'Компании платформы — кому быть парком' })
    companies(@Query() query: AdminCompaniesQueryDto) {
        return this.drivers.adminCompanies(query.q);
    }

    @Put('companies/:id/park')
    @ApiOperation({ summary: 'Сделать компанию парком или снять отметку' })
    setPark(@Param('id') id: string, @Body() dto: SetParkDto) {
        return this.drivers.setPark(id, dto.isPark);
    }

    @Put('companies/:id/access')
    @ApiOperation({ summary: 'Открыть компании биржу или закрыть (пока биржу проверяют)' })
    setAccess(@Param('id') id: string, @Body() dto: SetExchangeAccessDto) {
        return this.drivers.setExchangeAccess(id, dto.exchangeAccess);
    }
}
