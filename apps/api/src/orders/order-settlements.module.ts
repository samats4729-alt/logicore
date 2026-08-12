import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderSettlementsService } from './order-settlements.service';

/**
 * Лёгкий модуль: расчёты по рейсу нужны и заявкам, и бухгалтерским
 * документам.
 *
 * Заявкам — чтобы подставлять условия из карточек контрагентов и считать
 * плановые даты платежей. Документам — потому что проведённый счёт запускает
 * отсрочку «от даты счёта»: ровно в этот момент у рейса появляется день
 * отсчёта, и дату платежа надо пересчитать.
 *
 * Отдельным модулем, а не через OrdersModule: иначе AccountingDocumentsModule
 * потянул бы за собой заявки целиком вместе с их зависимостями, и импорты
 * замкнулись бы в кольцо. Кроме Prisma здесь ничего не нужно.
 */
@Module({
    imports: [PrismaModule],
    providers: [OrderSettlementsService],
    exports: [OrderSettlementsService],
})
export class OrderSettlementsModule {}
