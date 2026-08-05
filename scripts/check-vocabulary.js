#!/usr/bin/env node
/**
 * Проверка словаря интерфейса.
 *
 * Подписи статусов уже один раз расползлись по семи файлам и разошлись:
 * внутри компании документ был «Отменён», а контрагенту по публичной
 * ссылке тот же документ показывался как «Отменен». Одной разовой правки
 * мало — через месяц кто-нибудь скопирует словарь снова, поэтому правило
 * проверяется в CI.
 *
 * Запуск: node scripts/check-vocabulary.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'apps', 'web', 'src');
const VOCABULARY = path.join('lib', 'vocabulary.ts');

/**
 * Слова, где по-русски обязательна «ё».
 *
 * Только те формы, где «е» — действительно ошибка. «Счета», «завершена»,
 * «отменено» пишутся без «ё» и в список не входят: правило про мужской
 * род единственного числа, а не про корень слова.
 *
 * Границы слова заданы явными просмотрами по кириллице, а не `\b`: в
 * JavaScript `\b` считает словом только латиницу и цифры, поэтому
 * /\bОтменен\b/ не находит «Отменен» вообще.
 */
const before = '(?<![А-Яа-яЁё])';
const after = '(?![А-Яа-яЁё])';
const word = (form) => new RegExp(`${before}${form}${after}`);
const YO_REQUIRED = [
    ['Счет', 'Счёт'], ['счет', 'счёт'],
    ['Платеж', 'Платёж'], ['платеж', 'платёж'],
    ['Отменен', 'Отменён'], ['отменен', 'отменён'],
    ['Проведен', 'Проведён'], ['проведен', 'проведён'],
    ['Завершен', 'Завершён'], ['завершен', 'завершён'],
    ['Обновлен', 'Обновлён'], ['обновлен', 'обновлён'],
    ['Удален', 'Удалён'], ['удален', 'удалён'],
    ['Истек', 'Истёк'], ['истек', 'истёк'],
    ['Учет', 'Учёт'], ['учет', 'учёт'],
    ['Прошел', 'Прошёл'], ['прошел', 'прошёл'],
].map(([form, correct]) => [word(form), correct]);

/**
 * Ключи статусов рейса и документа — те, чьи подписи обязаны совпадать.
 *
 * У подписки и договора свои наборы статусов, они к словарю рейсов
 * отношения не имеют. Отличаем по числу совпавших ключей: у копии словаря
 * рейсов их много, у чужой сущности — один-два случайных (CANCELLED,
 * DRAFT). Порог 3 разделяет их надёжно.
 */
const STATUS_KEYS = [
    'PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING',
    'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'COMPLETED', 'PROBLEM', 'POSTED',
];
const OWN_DICTIONARY_THRESHOLD = 3;

/**
 * Цвета статусов рейса — та же история, что и с подписями.
 *
 * Словарь цветов был скопирован в шесть файлов и разошёлся: «В пути» на
 * четырёх экранах бирюзовый, на двух синий; «Отменён» то красный, то
 * серый. Отличаем копию от чужой сущности так же — по числу совпавших
 * ключей рейса, у которых значением стоит имя цвета.
 */
const ORDER_STATUS_KEYS = [
    'PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING',
    'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'COMPLETED', 'PROBLEM',
];
const COLORS = 'default|orange|blue|gold|lime|purple|cyan|green|red|magenta|volcano|geekblue|processing|success|warning|error|#[0-9a-fA-F]{3,8}';
const ORDER_STATUS_COLORS_FILE = path.join('lib', 'order-status.ts');

/** Сколько ключей статуса рейса файл раскрашивает сам. */
function ownStatusColors(source) {
    return ORDER_STATUS_KEYS.filter((key) =>
        new RegExp(`\\b${key}\\s*:\\s*['"](${COLORS})['"]`).test(source));
}

/** Термины, у которых в 1С есть одно принятое название. */
const FORBIDDEN_SYNONYMS = [
    [/['"]Наша компания['"]/, 'Организация'],
    [/['"]Создать на основании['"]/, 'Ввод на основании'],
];

/** Сколько ключей статуса рейса/документа файл подписывает сам. */
function ownStatusLabels(source) {
    return STATUS_KEYS.filter((key) =>
        new RegExp(`\\b${key}\\s*:\\s*['"][А-ЯЁа-яё]`).test(source));
}

function walk(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, files);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
    return files;
}

/** Строковые литералы — то, что видит пользователь. Комментарии не в счёт. */
function userStrings(source) {
    const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    return [...withoutComments.matchAll(/'([^'\\\n]{2,200})'|"([^"\\\n]{2,200})"/g)]
        .map((match) => ({
            text: match[1] ?? match[2],
            line: withoutComments.slice(0, match.index).split('\n').length,
        }))
        .filter((item) => /[А-Яа-яЁё]/.test(item.text));
}

const problems = [];

for (const file of walk(ROOT)) {
    const relative = path.relative(ROOT, file);
    const source = fs.readFileSync(file, 'utf8');

    const own = ownStatusLabels(source);
    if (relative !== VOCABULARY && own.length >= OWN_DICTIONARY_THRESHOLD) {
        const marker = new RegExp(`\\b${own[0]}\\s*:\\s*['"][А-ЯЁа-яё]`);
        const line = source.split('\n').findIndex((row) => marker.test(row)) + 1;
        problems.push({
            file: relative,
            line,
            message: `свой словарь подписей статусов (${own.length} шт.) — импортируйте из lib/vocabulary`,
        });
    }

    const ownColors = ownStatusColors(source);
    if (relative !== ORDER_STATUS_COLORS_FILE && ownColors.length >= OWN_DICTIONARY_THRESHOLD) {
        const marker = new RegExp(`\\b${ownColors[0]}\\s*:\\s*['"](${COLORS})['"]`);
        const line = source.split('\n').findIndex((row) => marker.test(row)) + 1;
        problems.push({
            file: relative,
            line,
            message: `свой словарь цветов статусов (${ownColors.length} шт.) — импортируйте из lib/order-status`,
        });
    }

    for (const { text, line } of userStrings(source)) {
        for (const [pattern, correct] of YO_REQUIRED) {
            if (pattern.test(text)) {
                problems.push({ file: relative, line, message: `«${text}» — нужно «${correct}»` });
            }
        }
        for (const [pattern, correct] of FORBIDDEN_SYNONYMS) {
            if (pattern.test(`'${text}'`)) {
                problems.push({ file: relative, line, message: `«${text}» — принято «${correct}»` });
            }
        }
    }
}

if (problems.length === 0) {
    console.log('Словарь интерфейса: расхождений нет.');
    process.exit(0);
}

console.error(`Словарь интерфейса: ${problems.length} расхождений.\n`);
for (const problem of problems) {
    console.error(`  apps/web/src/${problem.file}:${problem.line}  ${problem.message}`);
}
console.error('\nПодписи статусов берутся из apps/web/src/lib/vocabulary.ts.');
process.exit(1);
