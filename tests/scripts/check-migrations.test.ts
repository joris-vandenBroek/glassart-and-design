import { describe, expect, it } from 'vitest';
import { beoordeelMigratieStatus } from '../../scripts/check-migrations';

const REPO = ['2026-07-30-a.sql', '2026-08-07-b.sql'];

describe('beoordeelMigratieStatus', () => {
  it('passes when everything is applied', () => {
    const result = beoordeelMigratieStatus(REPO, { status: 200, body: { applied: REPO } }, 'staging');
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  // Only possible before the first deploy that ships the endpoint; afterwards the route
  // is always present, so a 404 can only mean "app older than this feature".
  it('warns but passes on 404', () => {
    const result = beoordeelMigratieStatus(REPO, { status: 404, body: null }, 'staging');
    expect(result.ok).toBe(true);
    expect(result.regels.join('\n')).toContain('::warning::');
  });

  it('fails on any other non-200', () => {
    const result = beoordeelMigratieStatus(REPO, { status: 502, body: null }, 'staging');
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('fails when the ledger table does not exist yet', () => {
    const result = beoordeelMigratieStatus(
      REPO,
      { status: 200, body: { applied: [], bootstrap: true } },
      'productie'
    );
    expect(result.ok).toBe(false);
    expect(result.regels.join('\n')).toContain('schema_migrations');
  });

  it('fails and names each pending migration plus the fix command', () => {
    const result = beoordeelMigratieStatus(
      REPO,
      { status: 200, body: { applied: ['2026-07-30-a.sql'] } },
      'productie'
    );
    expect(result.ok).toBe(false);
    const output = result.regels.join('\n');
    expect(output).toContain('2026-08-07-b.sql');
    expect(output).toContain('npm run db:migrate -- productie --confirm');
  });

  it('passes when the database is ahead of the repo', () => {
    const result = beoordeelMigratieStatus(
      REPO,
      { status: 200, body: { applied: [...REPO, '2026-09-01-later.sql'] } },
      'staging'
    );
    expect(result.ok).toBe(true);
  });
});
