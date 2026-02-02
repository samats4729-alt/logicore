
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking Cargo Categories...');
    const categories = await prisma.cargoCategory.findMany({
        include: { types: true }
    });

    if (categories.length === 0) {
        console.log('❌ No categories found!');
    } else {
        console.log(`✅ Found ${categories.length} categories:`);
        categories.forEach(c => {
            console.log(`- ${c.name} (${c.types.length} types)`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
