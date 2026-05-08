import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema/index';
import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL?.trim() || 'file:./evaya.db';
const isPostgresUrl = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');
const isSqliteUrl = databaseUrl.startsWith('file:') || databaseUrl.endsWith('.db') || databaseUrl.endsWith('.sqlite');

if (nodeEnv === 'production' && isSqliteUrl) {
  throw new Error('Production requires a PostgreSQL DATABASE_URL. SQLite and local database files are blocked in production.');
}

if (isPostgresUrl) {
  throw new Error('PostgreSQL DATABASE_URL detected. This repo still uses a SQLite Drizzle schema and driver. Complete the SQLite-to-PostgreSQL schema migration before starting production.');
}

// Extract path from file: URL
const dbPath = databaseUrl.replace('file:', '');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };

export * from './schema/index';
