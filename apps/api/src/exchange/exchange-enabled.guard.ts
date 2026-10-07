import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * Включена ли биржа на этом сервере.
 *
 * Биржа строится в отдельной ветке и не должна появиться в рабочем
 * кабинете, пока владелец не скажет. Выключатель — второй замок на случай,
 * если код попадёт в основную ветку раньше: без `EXCHANGE_ENABLED=true` в
 * настройках сервера биржи нет — ни вкладки, ни адресов.
 */
export function exchangeEnabled(): boolean {
    return process.env.EXCHANGE_ENABLED === 'true';
}

/** Выключенная биржа отвечает «не найдено» — как будто её нет вовсе. */
@Injectable()
export class ExchangeEnabledGuard implements CanActivate {
    canActivate(): boolean {
        if (!exchangeEnabled()) throw new NotFoundException();
        return true;
    }
}
