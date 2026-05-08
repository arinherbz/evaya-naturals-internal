import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/evaya_naturals_internal';

if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
  throw new Error('Drizzle requires DATABASE_URL to be a PostgreSQL connection string.');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
