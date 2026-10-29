import { BadRequestException, Controller, ForbiddenException, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeSettlementService } from './settlement.service';
import { fromBase, fromOnHand, fuelEstimate, monthlyDeduction } from './settlement-calc';

/** Число из строки запроса; не число — null. */
function numberOf(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

/**
 * Калькулятор водителя без ИП — для логистов и диспетчеров (задачи шефа, Q20).
 *
 * Шеф: «калькулятор доступен всем логистам и диспетчерам — для расчётов и
 * привлечения водителей в парк». Это та же арифметика, по которой биржа
 * считает отклик водителя парка (`settlement-calc.ts`), только без рейса и
 * без конкретного водителя: логист прикидывает «сколько водитель получит на
 * руки при такой сумме» или «во что обойдётся заказчику, если водитель
 * просит столько».
 *
 * Считает только парк — по своим ставкам (владелец, 29.10.2026: «этот
 * калькулятор должен видеть только та компания, у которой есть парк, а не
 * все»). Экспедитору и заказчику он ни к чему: водителей без ИП зовёт и
 * рассчитывает парк. Администратор платформы считает по стандартным ставкам.
 * Биржа для этого не нужна: это просто расчёт, он ничего не записывает.
 */
@ApiTags('exchange')
@Controller('exchange/calculator')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.LOGISTICIAN, UserRole.FORWARDER, UserRole.ACCOUNTANT)
@ApiBearerAuth()
export class DriverCalculatorController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settlement: ExchangeSettlementService,
    ) {}

    @Get('driver')
    @ApiOperation({ summary: 'Расчёт водителя без ИП: от суммы сделки или от суммы «на руки»' })
    async driver(
        @Request() req: any,
        @Query() query: { from?: string; amount?: string; km?: string; fuel?: string; deduction?: string; vat?: string },
    ) {
        const amount = numberOf(query.amount);
        if (!amount || amount <= 0) throw new BadRequestException('Укажите сумму');

        const company = req.user.companyId
            ? await this.prisma.company.findUnique({ where: { id: req.user.companyId }, select: { isPark: true } })
            : null;
        const isPark = !!company?.isPark;
        if (!isPark && req.user.role !== UserRole.ADMIN) {
            throw new ForbiddenException('Расчёт водителя без ИП доступен только парку');
        }
        const base = await this.settlement.parkSettings(isPark ? req.user.companyId : null);
        const vat = query.vat === undefined ? (base.rates.vatPct ?? 0) > 0 : query.vat === 'true';
        const rates = { ...base.rates, vatPct: vat ? (base.rates.vatPct || 16) : 0 };

        const km = numberOf(query.km);
        const fuelGiven = numberOf(query.fuel);
        const fuel = fuelGiven != null ? Math.max(0, fuelGiven) : fuelEstimate(km, base.fuelPerKm);
        const withDeduction = query.deduction === 'true';
        const position = { deductionLeft: withDeduction ? monthlyDeduction(rates) : 0, yearIpnBase: 0 };

        try {
            const calc = query.from === 'onHand'
                ? fromOnHand(amount, fuel, rates, position)
                : fromBase(amount, fuel, rates, position);
            return {
                calc,
                fuelPerKm: base.fuelPerKm,
                rates: {
                    opvPct: rates.opvPct, vosmsPct: rates.vosmsPct, soPct: rates.soPct, ipnPct: rates.ipnPct,
                    parkPct: rates.parkPct, platformPct: rates.platformPct, vatPct: rates.vatPct ?? 0,
                },
                ratesFrom: isPark ? 'PARK' : 'DEFAULT',
            };
        } catch (error) {
            if (error instanceof RangeError) throw new BadRequestException(error.message);
            throw error;
        }
    }
}
