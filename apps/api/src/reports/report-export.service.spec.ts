import * as XLSX from 'xlsx';
import { ReportExportService, MAX_ROWS } from './report-export.service';
import { ExportReportDto } from './dto/report-export.dto';

const COMPANY = 'company-1';

function makeService(company: { name: string; bin: string | null } | null = {
    name: 'ТОО «Альфа Транс»',
    bin: '100340009596',
}) {
    const prisma: any = { company: { findUnique: jest.fn().mockResolvedValue(company) } };
    return { service: new ReportExportService(prisma), prisma };
}

const dto = (overrides: Partial<ExportReportDto> = {}): ExportReportDto => ({
    title: 'Прибыли и убытки',
    periodFrom: '2026-07-01',
    periodTo: '2026-07-31',
    columns: [
        { key: 'month', title: 'Период' },
        { key: 'income', title: 'Доходы', numeric: true },
        { key: 'expense', title: 'Расходы', numeric: true },
    ],
    rows: [
        { month: 'июль 2026', income: 600000, expense: 250000 },
        { month: 'август 2026', income: 300000, expense: 100000 },
    ],
    ...overrides,
});

/** Читаем готовый файл так же, как его прочитает Excel. */
function readSheet(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return {
        workbook,
        sheet,
        rows: XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: true }),
    };
}

describe('ReportExportService — выгрузка отчёта в Excel', () => {
    it('создаёт настоящий xlsx, который открывается', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(COMPANY, dto());

        expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
        expect(() => readSheet(buffer)).not.toThrow();
    });

    // Главное свойство печатной шапки: через неделю по распечатке видно,
    // чей это отчёт, какой и за какой период.
    it('печатает шапку: организация, название отчёта и период', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(COMPANY, dto());
        const { rows } = readSheet(buffer);
        const header = rows.slice(0, 5).map((row) => String(row[0] ?? ''));

        expect(header[0]).toBe('ТОО «Альфа Транс»');
        expect(header[1]).toContain('100340009596');
        expect(header[2]).toBe('Прибыли и убытки');
        expect(header[3]).toContain('01.07.2026');
        expect(header[3]).toContain('31.07.2026');
        expect(header[4]).toContain('Сформирован');
    });

    it('название организации берёт из базы, а не из запроса', async () => {
        const { service, prisma } = makeService();

        await service.export(COMPANY, dto({ title: 'Отчёт' }));

        // Иначе в файле можно было бы напечатать чужое название.
        expect(prisma.company.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: COMPANY } }),
        );
    });

    it('без периода пишет «за всё время», а не пустую строку', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(
            COMPANY,
            dto({ periodFrom: undefined, periodTo: undefined }),
        );
        const { rows } = readSheet(buffer);

        expect(String(rows[3][0])).toContain('за всё время');
    });

    it('переносит заголовки и данные в том же порядке, что на экране', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(COMPANY, dto());
        const { rows } = readSheet(buffer);

        expect(rows[6]).toEqual(['Период', 'Доходы', 'Расходы']);
        expect(rows[7]).toEqual(['июль 2026', 600000, 250000]);
        expect(rows[8]).toEqual(['август 2026', 300000, 100000]);
    });

    // Если суммы уедут строками, Excel не сложит колонку — а ради этого
    // выгрузку и делают.
    it('числовые колонки кладёт числами, а не текстом', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(COMPANY, dto());
        const { sheet } = readSheet(buffer);

        // B8 — первая ячейка «Доходы» после шапки и заголовков.
        expect(sheet.B8.t).toBe('n');
        expect(sheet.B8.v).toBe(600000);
        expect(sheet.A8.t).toBe('s');
    });

    it('число, пришедшее строкой с пробелами, всё равно становится числом', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(COMPANY, dto({
            rows: [{ month: 'июль 2026', income: '600 000', expense: 0 }],
        }));
        const { sheet } = readSheet(buffer);

        expect(sheet.B8.t).toBe('n');
        expect(sheet.B8.v).toBe(600000);
    });

    it('добавляет строку «Итого», когда её передали', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(COMPANY, dto({
            totals: { income: 900000, expense: 350000 },
        }));
        const { rows } = readSheet(buffer);
        const last = rows[rows.length - 1];

        expect(last[0]).toBe('Итого');
        expect(last[1]).toBe(900000);
        expect(last[2]).toBe(350000);
    });

    it('в имени файла — название отчёта и дата', async () => {
        const { service } = makeService();

        const { fileName } = await service.export(COMPANY, dto());

        expect(fileName).toMatch(/^Прибыли_и_убытки_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it('имя листа режется до 31 символа — иначе Excel не откроет файл', async () => {
        const { service } = makeService();

        const { buffer } = await service.export(COMPANY, dto({
            title: 'Очень длинное название отчёта, которое Excel не примет целиком',
        }));
        const { workbook } = readSheet(buffer);

        expect(workbook.SheetNames[0].length).toBeLessThanOrEqual(31);
    });

    it('не выгружает больше потолка строк', async () => {
        const { service } = makeService();
        const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ month: String(i), income: i, expense: 0 }));

        await expect(service.export(COMPANY, dto({ rows })))
            .rejects.toThrow(/не больше/);
    });

    it('без организации отчёт не выгружается', async () => {
        const { service } = makeService(null);

        await expect(service.export(COMPANY, dto())).rejects.toThrow('Организация не найдена');
    });
});
