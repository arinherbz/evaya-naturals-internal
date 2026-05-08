import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, usingPglite } from './index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const migrate = usingPglite ? migratePglite : migrateNodePg;
  await migrate(db as never, {
    migrationsFolder: path.join(__dirname, 'migrations'),
  });
  console.log('Database migrations complete');
}

run().catch((error) => {
  console.error('Database migrations failed');
  console.error(error);
  process.exit(1);
});
