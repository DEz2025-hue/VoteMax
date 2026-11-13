import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Postgres connection (DEC-003). DATABASE_URL is required in production;
 * the app fails fast at bootstrap when it is absent there.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Headroom for concurrent requests plus the audit-outbox drainer.
  max: Number(process.env.PG_POOL_MAX ?? 20),
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
