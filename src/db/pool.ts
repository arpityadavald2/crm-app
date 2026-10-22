import { createPool } from 'mysql2/promise';
import { env } from '../config/env';

// The pool connects lazily: creating it does not open a connection yet.
export const pool = createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: 'utf8mb4',
  timezone: 'Z', // always UTC
  connectionLimit: env.DB_POOL_SIZE,
  queueLimit: 100, // fail fast instead of queueing forever when overloaded
  waitForConnections: true,
  connectTimeout: 5_000,
  enableKeepAlive: true,
});

/** Used by /ready. Throws if the database cannot answer a trivial query. */
export async function pingDb(db: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  await db.query('SELECT 1');
}
