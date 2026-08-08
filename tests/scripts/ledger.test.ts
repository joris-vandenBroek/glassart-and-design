import { afterEach, describe, expect, it } from 'vitest';
import type { Connection } from 'mysql2/promise';
import { verbind } from '../../scripts/lib/env';
import { leesToegepast, noteerToegepast, zorgVoorLedger } from '../../scripts/lib/ledger';

// Every fixture filename starts with `test-` so cleanup can target it by exact name.
// Never delete the whole table: it holds the real ledger for the shared staging database.
const FIXTURE = 'test-2026-01-01-ledger-fixture.sql';

let open: Connection | null = null;

async function connect(): Promise<Connection> {
  const { connection } = await verbind('staging');
  open = connection;
  return connection;
}

afterEach(async () => {
  if (open) {
    await open.query('DELETE FROM schema_migrations WHERE filename = ?', [FIXTURE]);
    await open.end();
    open = null;
  }
});

describe('ledger helpers', () => {
  it('creates the table when it is missing and reads back an empty-or-existing list', async () => {
    const connection = await connect();
    await zorgVoorLedger(connection);
    const applied = await leesToegepast(connection);
    expect(Array.isArray(applied)).toBe(true);
  });

  it('records a migration and reads it back, sorted', async () => {
    const connection = await connect();
    await zorgVoorLedger(connection);
    await noteerToegepast(connection, FIXTURE);
    const applied = await leesToegepast(connection);
    expect(applied).toContain(FIXTURE);
    expect([...applied]).toEqual([...applied].sort());
  });

  it('is idempotent -- recording the same migration twice does not throw', async () => {
    const connection = await connect();
    await zorgVoorLedger(connection);
    await noteerToegepast(connection, FIXTURE);
    await expect(noteerToegepast(connection, FIXTURE)).resolves.toBeUndefined();
  });
});

describe('leesOmgeving', () => {
  it('refuses an unknown environment name', async () => {
    await expect(verbind('acceptatie')).rejects.toThrow(/Onbekende omgeving/);
  });
});
