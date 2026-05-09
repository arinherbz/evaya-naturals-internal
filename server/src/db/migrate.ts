import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, usingPglite } from './index.js';
import { logServerError } from '../env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const migrate = usingPglite ? migratePglite : migrateNodePg;
  await migrate(db as never, {
    migrationsFolder: path.resolve(__dirname, '../../src/db/migrations'),
  });

  const result = await db.execute(sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = '__drizzle_migrations'
    ) as exists
  `);
  const row = result.rows[0] as { exists?: boolean } | undefined;
  if (!row?.exists) {
    throw new Error('Drizzle migration tracking table was not created.');
  }

  console.log('Database migrations complete');
}

run().catch((error) => {
  logServerError('Database migrations', error);
  process.exit(1);
});
