import type { Connection } from 'mysql2/promise';

// Overridable so tests can point the runner at a fixture directory instead of the real
// db/migrations/. Nothing in production sets this -- CI and the CLI both use the default.
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? 'db/migrations';

// IF NOT EXISTS on purpose: the ledger cannot itself be a migration file (the runner would
// have to read the ledger to discover whether the ledger exists), so it is created on
// demand instead. db/schema.sql carries the same definition for a database built from
// scratch. See the "Deviation from the spec" note in the plan.
const LEDGER_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export async function zorgVoorLedger(connection: Connection): Promise<void> {
  await connection.query(LEDGER_DDL);
}

export async function leesToegepast(connection: Connection): Promise<string[]> {
  const [rows] = await connection.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return (rows as Array<{ filename: string }>).map((row) => row.filename);
}

// INSERT IGNORE so re-recording an already-recorded migration is a no-op rather than a
// duplicate-key error -- the runner may retry after a partially failed run.
export async function noteerToegepast(connection: Connection, filename: string): Promise<void> {
  await connection.query('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [filename]);
}
