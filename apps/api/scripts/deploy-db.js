#!/usr/bin/env node
/**
 * Обновление структуры базы при деплое.
 *
 * Запускается Railway как preDeployCommand (см. railway.json). Обычный случай —
 * просто `prisma migrate deploy`. Отдельно обрабатывается ОДИН переходный
 * случай: база, которой раньше управляли через `prisma db push`.
 *
 * У такой базы все таблицы уже есть, но нет журнала миграций
 * (`_prisma_migrations`). Для неё `migrate deploy` останавливается с ошибкой
 * P3005 «The database schema is not empty» и деплой не проходит. Правильное
 * действие в этот момент — отметить нулевую миграцию как уже применённую
 * (`migrate resolve --applied`), ничего при этом не выполняя.
 *
 * Ветка срабатывает ровно один раз: после неё журнал существует всегда.
 *
 * Логика намеренно консервативна — отметка ставится, только если журнала нет
 * И при этом базовые таблицы на месте. Пустая база проходит обычным путём и
 * создаётся миграцией с нуля.
 */

const { execFileSync } = require('child_process');
const { Client } = require('pg');

const BASELINE_MIGRATION = '0_init';

// Таблица, по которой определяем, что база уже наполнена структурой.
// "User" создаётся нулевой миграцией и существует в любой рабочей базе.
const CORE_TABLE = 'User';

function runPrisma(args) {
    execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });
}

async function inspectDatabase() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL не задан — обновить структуру базы нельзя');
    }

    const client = new Client({ connectionString });
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_journal,
                    to_regclass($1) IS NOT NULL                 AS has_core_table`,
            [`public."${CORE_TABLE}"`],
        );
        return rows[0];
    } finally {
        await client.end();
    }
}

async function main() {
    const { has_journal: hasJournal, has_core_table: hasCoreTable } = await inspectDatabase();

    if (!hasJournal && hasCoreTable) {
        console.log(
            `[deploy-db] База управлялась через db push: таблицы есть, журнала миграций нет.\n`
            + `[deploy-db] Отмечаю ${BASELINE_MIGRATION} как уже применённую. Структура не меняется, данные не трогаются.`,
        );
        runPrisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION]);
    } else if (!hasJournal) {
        console.log('[deploy-db] База пустая — структура будет создана миграциями с нуля.');
    }

    runPrisma(['migrate', 'deploy']);
}

main().catch((error) => {
    console.error('[deploy-db] Не удалось обновить структуру базы:', error.message);
    process.exit(1);
});
