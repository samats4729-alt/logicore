import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { ExportReportDto, ReportColumnDto } from './dto/report-export.dto';

/** Потолки выборки: файл — для чтения человеком, а не для выгрузки базы. */
export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 30;

/**
 * Выгрузка отчёта в Excel с печатной шапкой.
 *
 * Считает отчёты «Конструктор отчётов» на клиенте: он сводит заявки,
 * платежи и водителей в пять разных таблиц. Поэтому выгружается ровно то,
 * что человек видит на экране, а не пересчитанное заново на сервере —
 * иначе рядом появилась бы вторая реализация тех же цифр, и рано или
 * поздно две версии одного отчёта разошлись бы.
 *
 * Шапка при этом собирается на сервере: название организации берётся из
 * сессии, а не из запроса, чтобы в чужом файле не оказалось нашего имени.
 */
@Injectable()
export class ReportExportService {
    constructor(private readonly prisma: PrismaService) {}

    async export(companyId: string, dto: ExportReportDto): Promise<{ buffer: Buffer; fileName: string }> {
        if (dto.rows.length > MAX_ROWS) {
            throw new BadRequestException(`В выгрузку помещается не больше ${MAX_ROWS} строк`);
        }
        if (dto.columns.length > MAX_COLUMNS) {
            throw new BadRequestException(`В выгрузку помещается не больше ${MAX_COLUMNS} колонок`);
        }

        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { name: true, bin: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');

        const sheet = this.buildSheet(company, dto);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, this.sheetName(dto.title));

        return {
            buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
            fileName: this.fileName(dto),
        };
    }

    private buildSheet(company: { name: string; bin: string | null }, dto: ExportReportDto) {
        const width = dto.columns.length;

        // Печатная шапка: кто, что и за какой период. Без неё распечатанный
        // лист невозможно опознать через неделю.
        const header: (string | number | null)[][] = [
            [company.name],
            [company.bin ? `БИН/ИИН: ${company.bin}` : ''],
            [dto.title],
            [this.periodLine(dto)],
            [`Сформирован: ${this.formatDateTime(new Date())}`],
            [],
        ];

        const body: (string | number | null)[][] = [
            dto.columns.map((column) => column.title),
            ...dto.rows.map((row) => dto.columns.map((column) => this.cell(row[column.key], column))),
        ];

        if (dto.totals) {
            body.push(dto.columns.map((column, index) => {
                if (index === 0) return 'Итого';
                const value = dto.totals?.[column.key];
                return value === undefined ? null : this.cell(value, column);
            }));
        }

        const sheet = XLSX.utils.aoa_to_sheet([...header, ...body]);

        // Шапка растянута на всю ширину таблицы, иначе название организации
        // обрезается первой колонкой.
        sheet['!merges'] = header
            .slice(0, 5)
            .map((_, index) => ({ s: { r: index, c: 0 }, e: { r: index, c: Math.max(0, width - 1) } }));

        sheet['!cols'] = dto.columns.map((column, index) => ({
            wch: Math.min(60, Math.max(
                column.title.length + 2,
                ...dto.rows.map((row) => String(row[column.key] ?? '').length + 2),
                index === 0 ? 18 : 10,
            )),
        }));

        return sheet;
    }

    /** Числа кладём числами: иначе Excel не сложит колонку. */
    private cell(value: unknown, column: ReportColumnDto): string | number | null {
        if (value === null || value === undefined) return null;
        if (column.numeric) {
            const numeric = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
            return Number.isFinite(numeric) ? numeric : null;
        }
        return String(value);
    }

    private periodLine(dto: ExportReportDto): string {
        if (!dto.periodFrom || !dto.periodTo) return 'Период: за всё время';
        return `Период: с ${this.formatDate(dto.periodFrom)} по ${this.formatDate(dto.periodTo)}`;
    }

    private formatDate(value: string): string {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
    }

    private formatDateTime(date: Date): string {
        return `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }

    /** Имя листа в Excel: не длиннее 31 символа и без служебных знаков. */
    private sheetName(title: string): string {
        return title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Отчёт';
    }

    private fileName(dto: ExportReportDto): string {
        const stamp = new Date().toISOString().slice(0, 10);
        const base = dto.title.replace(/[^\wА-Яа-яЁё-]+/g, '_').slice(0, 60);
        return `${base}_${stamp}.xlsx`;
    }
}
