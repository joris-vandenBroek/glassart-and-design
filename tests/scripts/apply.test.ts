import { afterEach, describe, expect, it } from 'vitest';
import type { Connection } from 'mysql2/promise';
import { verbind } from '../../scripts/lib/env';
import { pasMigratiesToe } from '../../scripts/lib/apply';
import { leesToegepast, zorgVoorLedger } from '../../scripts/lib/ledger';

const FIXTURE_DIR = 'tests/fixtures/migrations';
const OK = '2026-01-01-test-scratch-ok.sql';
const KAPOT = '2026-01-02-test-scratch-kapot.sql';

let open: Connection | null = null;

async function connect(): Promise<Connection> {
  const { connection } = await verbind('staging');
  open = connection;
  await zorgVoorLedger(connection);
  return connection;
}

// Removes exactly what these tests create: the two fixture ledger rows (by exact filename)
// and the scratch table. Never touches any other row in schema_migrations.
afterEach(async () => {
  if (open) {
    await open.query('DELETE FROM schema_migrations WHERE filename IN (?, ?)', [OK, KAPOT]);
    await open.query('DROP TABLE IF EXISTS test_scratch_apply');
    await open.end();
    open = null;
  }
});

describe('pasMigratiesToe', () => {
  it('runs a migration, records it, and reports no failure', async () => {
    const connection = await connect();
    const resultaat = await pasMigratiesToe(connection, FIXTURE_DIR, [OK], () => {});

    expect(resultaat.mislukt).toBeNull();
    expect(resultaat.toegepast).toEqual([OK]);
    expect(await leesToegepast(connection)).toContain(OK);

    const [rows] = await connection.query('SELECT id FROM test_scratch_apply');
    expect((rows as Array<{ id: number }>).map((r) => r.id)).toEqual([1]);
  });

  it('stops at the failing statement and does not record the file', async () => {
    const connection = await connect();
    await pasMigratiesToe(connection, FIXTURE_DIR, [OK], () => {});

    const resultaat = await pasMigratiesToe(connection, FIXTURE_DIR, [KAPOT], () => {});

    expect(resultaat.toegepast).toEqual([]);
    expect(resultaat.mislukt).not.toBeNull();
    expect(resultaat.mislukt!.filename).toBe(KAPOT);
    // Statement 1 (the INSERT) succeeded; statement 2 (the duplicate column) failed.
    expect(resultaat.mislukt!.index).toBe(1);
    expect(resultaat.mislukt!.statement).toContain('ADD COLUMN id');

    // The half-applied file must NOT be in the ledger -- that is the whole point.
    expect(await leesToegepast(connection)).not.toContain(KAPOT);
    // ...and the statement that did succeed before the failure is still committed, because
    // MySQL has no transactional DDL. Asserting it makes that irreversibility explicit.
    const [rows] = await connection.query('SELECT id FROM test_scratch_apply ORDER BY id');
    expect((rows as Array<{ id: number }>).map((r) => r.id)).toEqual([1, 2]);
  });

  it('stops before later files once one has failed', async () => {
    const connection = await connect();
    const resultaat = await pasMigratiesToe(connection, FIXTURE_DIR, [KAPOT, OK], () => {});

    expect(resultaat.mislukt!.filename).toBe(KAPOT);
    expect(resultaat.toegepast).toEqual([]);
    expect(await leesToegepast(connection)).not.toContain(OK);
  });
});
