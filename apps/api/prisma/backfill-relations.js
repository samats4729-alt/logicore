const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Starting UserCompanyRelation backfill...');
    const users = await prisma.user.findMany({
      where: {
        companyId: { not: null },
      },
      select: {
        id: true,
        companyId: true,
        role: true,
      },
    });

    console.log(`Found ${users.length} users with companyId.`);
    let checkedCount = 0;

    for (const user of users) {
      if (!user.companyId) continue;
      
      // Upsert relation to ensure it exists, ignoring updates if it already does
      await prisma.userCompanyRelation.upsert({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: user.companyId,
          },
        },
        create: {
          userId: user.id,
          companyId: user.companyId,
          role: user.role,
        },
        update: {},
      });
      checkedCount++;
    }

    console.log(`UserCompanyRelation backfill completed successfully. Checked ${checkedCount} users.`);
  } catch (error) {
    console.error('Error during UserCompanyRelation backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unhandled error in backfill-relations:', err);
  process.exit(1);
});
