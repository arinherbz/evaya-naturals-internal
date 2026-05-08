import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema/index';
import path from 'node:path';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL?.trim();

function isPostgresUrl(url: string) {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

function isSqliteUrl(url: string) {
  return url.startsWith('file:') || url.endsWith('.db') || url.endsWith('.sqlite');
}

if (nodeEnv === 'production' && !databaseUrl) {
  throw new Error('Production requires DATABASE_URL to be set to a PostgreSQL connection string.');
}

if (databaseUrl && isSqliteUrl(databaseUrl)) {
  throw new Error('SQLite DATABASE_URL values are no longer supported. Use PostgreSQL.');
}

if (databaseUrl && !isPostgresUrl(databaseUrl)) {
  throw new Error('Unsupported DATABASE_URL. Use a PostgreSQL connection string.');
}

export const usingPglite = !databaseUrl && nodeEnv !== 'production';

const pgliteDataDir = path.resolve(process.cwd(), '.pglite');

const pgPool = !usingPglite
  ? new Pool({
    connectionString: databaseUrl,
    ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
  })
  : null;

const pglite = usingPglite
  ? new PGlite(nodeEnv === 'test' ? undefined : pgliteDataDir)
  : null;

export const db = pgPool
  ? drizzle(pgPool, { schema })
  : drizzlePglite(pglite!, { schema });

export async function closeDatabase() {
  if (pgPool) {
    await pgPool.end();
  }

  if (pglite) {
    await pglite.close();
  }
}

export * from './schema/index';
