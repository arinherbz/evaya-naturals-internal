import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema/index.js';
import { appEnv } from '../env.js';

const databaseUrl = appEnv.databaseUrl;

function isPostgresUrl(url: string) {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

function isSqliteUrl(url: string) {
  return url.startsWith('file:') || url.endsWith('.db') || url.endsWith('.sqlite');
}

function isLocalPostgresUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

if (appEnv.isProduction && !databaseUrl) {
  throw new Error('Production requires DATABASE_URL to be set to a PostgreSQL connection string.');
}

if (databaseUrl && isSqliteUrl(databaseUrl)) {
  throw new Error('SQLite DATABASE_URL values are no longer supported. Use PostgreSQL.');
}

if (databaseUrl && !isPostgresUrl(databaseUrl)) {
  throw new Error('Unsupported DATABASE_URL. Use a PostgreSQL connection string.');
}

export const usingPglite = !databaseUrl && !appEnv.isProduction;

const pgPool = !usingPglite
  ? new Pool({
    connectionString: databaseUrl,
    ssl: appEnv.isProduction && databaseUrl && !isLocalPostgresUrl(databaseUrl)
      ? { rejectUnauthorized: true }
      : undefined,
  })
  : null;

const pglite = usingPglite
  ? new PGlite()
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

export * from './schema/index.js';
