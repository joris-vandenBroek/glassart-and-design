import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

// These tests drive the CLI as a real child process so exit codes are the real
// process.exit() codes, not a mocked stand-in.
//
// SAFETY: every case here is an argument-validation refusal that must exit BEFORE
// scripts/db-migrate.ts ever calls verbind() and opens a database connection -- in
// particular, no case may reach `productie`. A generous but bounded timeout turns a
// hang (e.g. an accidental real connection attempt) into a failing test instead of a
// stuck suite.
const TIMEOUT_MS = 15_000;

function runCli(args: string[]) {
  return spawnSync('npx', ['tsx', 'scripts/db-migrate.ts', ...args], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    shell: true,
  });
}

describe('db-migrate CLI argument validation', () => {
  it('refuses `apply productie` without --confirm', () => {
    const result = runCli(['apply', 'productie']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('vereist expliciet --confirm');
  });

  // The Critical regression test: under the old condition
  // (`!confirm && !markFilename`), supplying --mark-applied bypassed this guard
  // entirely and would have gone on to open a real connection to productie.
  it('refuses `apply productie --mark-applied <file>` without --confirm', () => {
    const result = runCli([
      'apply',
      'productie',
      '--mark-applied',
      '2026-08-07-zendingnummer.sql',
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('vereist expliciet --confirm');
  });

  it('refuses `--mark-applied` with no filename', () => {
    const result = runCli(['apply', 'staging', '--mark-applied']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('vereist een bestandsnaam');
  });

  it('refuses an unknown subcommand with usage text', () => {
    const result = runCli(['frobnicate', 'staging']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Gebruik: npm run db:status');
  });
});
