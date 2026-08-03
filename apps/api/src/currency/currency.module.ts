import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';

/** Раз в шесть часов: Нацбанк объявляет курс раз в сутки, но не в одно время. */
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Module({
    imports: [PrismaModule, AuditModule],
    controllers: [CurrencyController],
    providers: [CurrencyService],
    exports: [CurrencyService],
})
export class CurrencyModule implements OnApplicationBootstrap {
    private readonly logger = new Logger('CurrencyModule');

    constructor(private readonly currency: CurrencyService) { }

    /**
     * Справочник заводим при запуске, курсы подтягиваем фоном.
     *
     * Ни то, ни другое не должно мешать приложению подняться: если сайт
     * Нацбанка лежит, система обязана работать на вчерашних курсах, а не
     * отказываться стартовать.
     */
    onApplicationBootstrap() {
        this.currency.ensureCatalog()
            .then((count) => this.logger.log(`Справочник валют: ${count} записей`))
            .catch((e) => this.logger.error(`Не удалось завести справочник валют: ${e.message}`));

        this.refresh();
        setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    }

    private refresh() {
        const today = new Date().toISOString().slice(0, 10);
        this.currency.importFromNbk(today)
            .then((result) => this.logger.log(
                `Курсы Нацбанка на ${result.rateDate}: сохранено ${result.saved}` +
                (result.isCarriedOver ? ' (курс перенесён с прежней даты)' : ''),
            ))
            .catch((e) => this.logger.warn(`Курсы Нацбанка не загрузились: ${e.message}`));
    }
}
