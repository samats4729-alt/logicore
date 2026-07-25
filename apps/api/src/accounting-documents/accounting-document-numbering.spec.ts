import * as fs from 'fs';
import * as path from 'path';

/**
 * Номера бухгалтерских документов выдаются отдельными последовательностями
 * для исходящих и входящих — счётчик `AccountingDocumentNumbering` ключуется
 * по companyId + type + direction + year.
 *
 * Если уникальность самого документа направление не учитывает, две
 * последовательности начинаются с единицы и сталкиваются: первый входящий
 * счёт получает «СЧ-2026-000001», который уже занят исходящим, и создать
 * его нельзя вовсе — раздел «Входящие» остаётся пустым навсегда.
 *
 * Проверка идёт по схеме, потому что защищает именно ограничение БД:
 * тесты на моках такого столкновения не увидят.
 */
describe('Нумерация бухгалтерских документов', () => {
    const schema = fs.readFileSync(
        path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
        'utf8',
    );

    const modelBody = (name: string) => {
        const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
        if (!match) throw new Error(`Модель ${name} не найдена в схеме`);
        return match[1];
    };

    const uniqueKeys = (body: string) =>
        Array.from(body.matchAll(/@@unique\(\[([^\]]+)\]\)/g))
            .map((match) => match[1].split(',').map((field) => field.trim()));

    it('уникальность номера документа учитывает направление', () => {
        const keys = uniqueKeys(modelBody('AccountingDocument'));
        const numberKey = keys.find((key) => key.includes('number'));

        expect(numberKey).toBeDefined();
        expect(numberKey).toContain('direction');
    });

    it('гранулярность счётчика и уникальности документа совпадает', () => {
        const counterKey = uniqueKeys(modelBody('AccountingDocumentNumbering'))[0];
        const documentKey = uniqueKeys(modelBody('AccountingDocument'))
            .find((key) => key.includes('number'))!;

        // Всё, чем различаются последовательности, обязано входить в ключ
        // уникальности документа — иначе номера из разных счётчиков
        // столкнутся.
        for (const field of counterKey.filter((f) => f !== 'year')) {
            expect(documentKey).toContain(field);
        }
    });
});
