import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Restoring user admin11@logcomp.kz...');

    const passwordHash = await bcrypt.hash('admin123', 10);

    const user = await prisma.user.upsert({
        where: { email: 'admin11@logcomp.kz' },
        update: {},
        create: {
            email: 'admin11@logcomp.kz',
            phone: '+77770000011', // Dummy phone
            passwordHash,
            firstName: 'Admin11',
            lastName: 'User',
            role: UserRole.COMPANY_ADMIN, // Assuming company admin based on email
            company: {
                create: {
                    name: 'Company 11',
                    email: 'admin11@logcomp.kz',
                    type: 'CUSTOMER'
                }
            }
        },
    });

    console.log(`✅ User restored: ${user.email}`);
    console.log(`🔑 Password: admin123`);
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
