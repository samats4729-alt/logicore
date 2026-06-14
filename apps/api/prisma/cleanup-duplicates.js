const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('No DATABASE_URL found, skipping duplicate cleanup.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Check if FinanceAccount table exists
    const resAcc = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'FinanceAccount'
      );
    `);
    const accExists = resAcc.rows[0].exists;

    if (accExists) {
      console.log('Cleaning up duplicate FinanceAccount records...');
      await client.query(`
        WITH duplicate_groups AS (
          SELECT
            id,
            "companyId",
            name,
            kind,
            row_number() OVER (
              PARTITION BY "companyId", name, kind
              ORDER BY "createdAt" ASC, id ASC
            ) as rn,
            first_value(id) OVER (
              PARTITION BY "companyId", name, kind
              ORDER BY "createdAt" ASC, id ASC
            ) as master_id
          FROM "FinanceAccount"
        ),
        duplicates_to_delete AS (
          SELECT id, master_id
          FROM duplicate_groups
          WHERE rn > 1
        )
        UPDATE "Payment" p
        SET "accountId" = d.master_id
        FROM duplicates_to_delete d
        WHERE p."accountId" = d.id;
      `);

      await client.query(`
        WITH duplicate_groups AS (
          SELECT
            id,
            row_number() OVER (
              PARTITION BY "companyId", name, kind
              ORDER BY "createdAt" ASC, id ASC
            ) as rn
          FROM "FinanceAccount"
        )
        DELETE FROM "FinanceAccount"
        WHERE id IN (
          SELECT id FROM duplicate_groups WHERE rn > 1
        );
      `);
      console.log('FinanceAccount cleanup completed.');
    } else {
      console.log('FinanceAccount table does not exist yet. Skipping cleanup.');
    }

    // Check if FinanceCategory table exists
    const resCat = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'FinanceCategory'
      );
    `);
    const catExists = resCat.rows[0].exists;

    if (catExists) {
      console.log('Cleaning up duplicate FinanceCategory records...');
      await client.query(`
        WITH duplicate_groups AS (
          SELECT
            id,
            "companyId",
            name,
            direction,
            row_number() OVER (
              PARTITION BY "companyId", name, direction
              ORDER BY "createdAt" ASC, id ASC
            ) as rn,
            first_value(id) OVER (
              PARTITION BY "companyId", name, direction
              ORDER BY "createdAt" ASC, id ASC
            ) as master_id
          FROM "FinanceCategory"
        ),
        duplicates_to_delete AS (
          SELECT id, master_id
          FROM duplicate_groups
          WHERE rn > 1
        )
        UPDATE "Payment" p
        SET "categoryId" = d.master_id
        FROM duplicates_to_delete d
        WHERE p."categoryId" = d.id;
      `);

      await client.query(`
        WITH duplicate_groups AS (
          SELECT
            id,
            row_number() OVER (
              PARTITION BY "companyId", name, direction
              ORDER BY "createdAt" ASC, id ASC
            ) as rn
          FROM "FinanceCategory"
        )
        DELETE FROM "FinanceCategory"
        WHERE id IN (
          SELECT id FROM duplicate_groups WHERE rn > 1
        );
      `);
      console.log('FinanceCategory cleanup completed.');
    } else {
      console.log('FinanceCategory table does not exist yet. Skipping cleanup.');
    }

  } catch (error) {
    console.error('Error during duplicate cleanup:', error);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Unhandled error in cleanup-duplicates:', err);
});
