import mysql from 'mysql2/promise';

// Next.js dev-mode Fast Refresh re-evaluates this module on every file save, which would
// reset a plain module-level `pool` variable and leak a fresh, never-closed connection pool
// against the shared MySQL user each time. Caching on `globalThis` survives module reloads
// within the same Node process (production only ever evaluates this module once, so it's a
// no-op there), matching the standard Next.js dev-pool-singleton pattern.
const globalForPool = globalThis as unknown as { __mysqlPool?: mysql.Pool };

export function getPool(): mysql.Pool {
  if (!globalForPool.__mysqlPool) {
    globalForPool.__mysqlPool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return globalForPool.__mysqlPool;
}
