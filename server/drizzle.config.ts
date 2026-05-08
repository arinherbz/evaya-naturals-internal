import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || 'file:./evaya.db';

if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
  throw new Error('This Drizzle config is still SQLite-only. Migrate the schema definitions to PostgreSQL before running Drizzle against PostgreSQL.');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
