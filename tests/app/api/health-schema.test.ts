import { afterEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/server/db';
import { GET } from '@/app/api/health/schema/route';

// Prefixed `test-` and removed by exact filename. Never delete the whole table: it is the
// real ledger for the shared staging database.
const FIXTURE = 'test-2026-01-02-endpoint-fixture.sql';

afterEach(async () => {
  await getPool().query('DELETE FROM schema_migrations WHERE filename = ?', [FIXTURE]);
});

describe('GET /api/health/schema', () => {
  it('returns the applied migrations, sorted', async () => {
    await getPool().query('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [FIXTURE]);

    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { applied: string[]; bootstrap?: boolean };
    expect(body.bootstrap).toBeUndefined();
    expect(body.applied).toContain(FIXTURE);
    expect([...body.applied]).toEqual([...body.applied].sort());
  });

  // Deliberate cross-check against the real, seeded baseline ledger (see Task 4) rather than
  // a fixture this test creates itself -- confirms the endpoint reads the actual
  // schema_migrations table, not just whatever the previous test inserted. This will fail
  // for anyone whose staging ledger has been reseeded from scratch and no longer contains
  // this filename; if that happens, swap in whatever real row the current baseline has.
  it('reports the real migrations that Task 4 seeded', async () => {
    const response = await GET();
    const body = (await response.json()) as { applied: string[] };
    expect(body.applied).toContain('2026-08-07-zendingnummer.sql');
  });
});
