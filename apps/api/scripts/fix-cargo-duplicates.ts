import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🔍 Ищу дубли типов грузов...');

    const allTypes = await prisma.cargoType.findMany({
        orderBy: { sortOrder: 'asc' },
    });

    // Группируем по name + categoryId
    const groups = new Map<string, typeof allTypes>();
    for (const t of allTypes) {
        const key = `${t.name}__${t.categoryId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
    }

    let deleted = 0;
    for (const [key, items] of groups) {
        if (items.length > 1) {
            // Оставляем первый, удаляем остальные
            const toDelete = items.slice(1);
            console.log(`  ❌ "${items[0].name}" — удаляю ${toDelete.length} дубл(ей)`);
            await prisma.cargoType.deleteMany({
                where: { id: { in: toDelete.map(t => t.id) } },
            });
            deleted += toDelete.length;
        }
    }

    if (deleted === 0) {
        console.log('✅ Дублей не найдено!');
    } else {
        console.log(`\n✅ Удалено ${deleted} дубл(ей). Готово!`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
