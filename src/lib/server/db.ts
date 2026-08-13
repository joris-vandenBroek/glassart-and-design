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
      // Without this, mysql2 returns DECIMAL columns (materiaaldikte, prijs, etc.) as
      // strings, silently breaking every `=== <number>` comparison against them even
      // though every DECIMAL column is typed as `number` in materiaalTypes.ts.
      decimalNumbers: true,
      // Same class of bug as decimalNumbers above, but for BOOLEAN columns (aiGegenereerd,
      // standaard, staatEigenMaatToe): mysql2 returns TINYINT(1) as a JS number (0/1), not a
      // boolean, silently breaking every `=== true` comparison even though those columns are
      // typed as `boolean` in materiaalTypes.ts. Concretely broke the "Alleen AI-gegenereerd"
      // collectiefilter, which compared `kunstwerk.aiGegenereerd === true` against a `1`.
      typeCast(field, next) {
        if (field.type === 'TINY' && field.length === 1) {
          const value = field.string();
          return value === null ? null : value === '1';
        }
        return next();
      },
      waitForConnections: true,
      // Overridable per environment (DB_CONNECTION_LIMIT) since staging/production get
      // different max_user_connections grants from the host and may need different tuning
      // without a code change.
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
      // A saturated pool should fail fast with a clear error rather than hang requests
      // indefinitely waiting for a free connection (mysql2's default queueLimit is 0 =
      // unlimited queueing).
      queueLimit: Number(process.env.DB_QUEUE_LIMIT ?? 20),
      // Detects and drops half-dead TCP connections (e.g. after a network blip or the
      // MySQL server closing an idle connection) instead of handing them back out of the
      // pool and failing the next query that tries to use them.
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    });
  }
  return globalForPool.__mysqlPool;
}
