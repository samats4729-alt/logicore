import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking for user admin11@logcomp.kz...');
    const user = await prisma.user.findUnique({
        where: { email: 'admin11@logcomp.kz' },
    });

    if (user) {
        console.log('✅ User found:', user);
    } else {
        console.log('❌ User NOT found.');

        console.log('Listing all users:');
        const allUsers = await prisma.user.findMany({
            select: { email: true, role: true }
        });
        console.log(allUsers);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
