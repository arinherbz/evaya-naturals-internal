import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
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
  console.log('Database migrations complete');
}

run().catch((error) => {
  logServerError('Database migrations', error);
  process.exit(1);
});
