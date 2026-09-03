import { ContractPdfService } from './contract-pdf.service';
import { getDefaultContractTemplate } from './contract-template';

/**
 * Вёрстка последней страницы договора: таблица реквизитов и блок подписей
 * с печатью.
 *
 * Реквизиты пишет человек, и длина их ничем не ограничена. Пока их было
 * десять строк, всё сходилось само; на сорока блок подписей начинался
 * слишком низко, pdfkit добавлял страницы под перенос строк, и в договор
 * попадали почти пустые листы, а печать — картинка, страницу она не
 * переносит — уезжала под обрез.
 *
 * Проверяем по числу страниц: лишние листы — первый и самый заметный
 * признак того, что низ страницы снова считают неправильно.
 */

const FORWARDER = 'company-forwarder';

/** Число страниц в готовом PDF. */
function страниц(pdf: Buffer): number {
    // Объекты страниц в pdfkit не сжимаются, поэтому их видно прямо в файле.
    // `/Pages` — это оглавление, оно не в счёт, отсюда граница слова.
    return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
}

/** Реквизиты в N строк с каждой стороны. */
function реквизиты(строк: number) {
    const столбец = Array.from({ length: строк }, (_, i) => `Строка реквизитов номер ${i + 1}`).join('\n');
    return { left: столбец, right: столбец };
}

function договор(requisites: { left: string; right: string }) {
    const статьи = getDefaultContractTemplate();
    const content = [
        ...статьи,
        { title: `${статьи.length + 1}. Реквизиты сторон`, paragraphs: [], requisites },
    ];
    const contract = {
        id: 'contract-1',
        contractNumber: '17/01',
        startDate: new Date('2026-01-17'),
        endDate: null,
        content,
        customerCompany: { id: 'company-customer', name: 'ТОО «Заказчик»', directorName: 'Сериков А.Т.' },
        forwarderCompany: { id: FORWARDER, name: 'ТОО «Экспедитор»', directorName: 'Зарутский Е.В.' },
        agreements: [],
    };
    const prisma: any = { contract: { findUnique: jest.fn().mockResolvedValue(contract) } };
    const s3: any = { isS3Enabled: jest.fn().mockReturnValue(false) };
    return new ContractPdfService(prisma, s3).generateContractPdf('contract-1', {
        requestingCompanyId: FORWARDER,
    });
}

describe('PDF договора — реквизиты и подписи на последней странице', () => {
    jest.setTimeout(60000);

    it('короткие реквизиты умещаются вместе с подписями на одной странице', async () => {
        const короткие = страниц(await договор(реквизиты(10)));
        const без = страниц(await договор({ left: '', right: '' }));

        // Пустые колонки за реквизиты не считаются — печатается таблица из
        // карточек компаний, и она такой же высоты. Числа должны совпасть:
        // иначе десять строк реквизитов зачем-то занимают лишний лист.
        expect(короткие).toBe(без);
    });

    it('длинные реквизиты добавляют ровно один лист — под подписи', async () => {
        // Сорок строк занимают почти всю страницу: подписям на ней уже не
        // хватает, и они честно переезжают на следующую. Раньше на этом
        // месте выходило два-шесть лишних листов, из них почти пустых.
        const базовые = страниц(await договор(реквизиты(10)));
        const длинные = страниц(await договор(реквизиты(40)));

        expect(длинные).toBe(базовые + 1);
    });

    it('реквизиты длиннее страницы переносятся, а не обрезаются', async () => {
        // 130 строк — это ещё два листа сверх того, на котором таблица
        // началась. Если бы перенос не работал, она нарисовалась бы поверх
        // нижнего поля и лишних листов не появилось бы вовсе.
        const базовые = страниц(await договор(реквизиты(10)));
        const огромные = страниц(await договор(реквизиты(130)));

        expect(огромные).toBe(базовые + 2);
    });
});
