import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import http, { type Server } from 'node:http';
import fs from 'node:fs';
import { MIGRATIONS_DIR } from '../../scripts/lib/ledger';
import { sorteerMigraties } from '../../scripts/lib/migrations';

// These tests drive the CLI as a real child process against a local HTTP server the test
// itself starts, so the fetch/response/exit-code path (main()) gets real coverage instead
// of only the pure beoordeelMigratieStatus() function -- and it's hermetic, no staging
// environment involved.
//
// IMPORTANT: this uses async spawn(), not spawnSync(). spawnSync blocks the parent's
// event loop for the whole child run, which would starve the local http.Server (running
// in this same process) of the chance to ever handle the child's request -- a deadlock
// that only resolves via the timeout. spawn() keeps the parent's event loop free.
const TIMEOUT_MS = 15_000;

const REPO_MIGRATIONS = sorteerMigraties(fs.readdirSync(MIGRATIONS_DIR));

let server: Server;
let baseUrl: string;
let nextStatus = 200;
let nextBody: unknown = null;

function runCli(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'scripts/check-migrations.ts', ...args], { shell: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI hing vast en is na ${TIMEOUT_MS}ms gedood: ${['npx', 'tsx', 'scripts/check-migrations.ts', ...args].join(' ')}`));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (nextStatus === 200) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(nextBody));
    } else {
      res.writeHead(nextStatus);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Verwachtte een AddressInfo van de testserver.');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('check-migrations CLI', () => {
  it('exits 0 and reports all migrations applied on a full 200 response', async () => {
    nextStatus = 200;
    nextBody = { applied: REPO_MIGRATIONS };

    const result = await runCli([baseUrl, 'staging']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Alle ${REPO_MIGRATIONS.length} migraties zijn toegepast op staging.`);
  }, TIMEOUT_MS + 2_000);

  it('exits 1 and lists pending migrations plus the fix command when nothing is applied', async () => {
    nextStatus = 200;
    nextBody = { applied: [] };

    const result = await runCli([baseUrl, 'staging']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nog niet toegepast op staging');
    expect(result.stderr).toContain('npm run db:migrate -- staging');
  }, TIMEOUT_MS + 2_000);

  it('exits 1 and mentions schema_migrations when the ledger table does not exist yet (bootstrap)', async () => {
    nextStatus = 200;
    nextBody = { applied: [], bootstrap: true };

    const result = await runCli([baseUrl, 'productie']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('schema_migrations');
  }, TIMEOUT_MS + 2_000);

  it('exits 0 with a ::warning:: when the endpoint does not exist yet (404)', async () => {
    nextStatus = 404;
    nextBody = null;

    const result = await runCli([baseUrl, 'staging']);

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain('::warning::');
  }, TIMEOUT_MS + 2_000);

  it('exits 1 and mentions the status on a 502', async () => {
    nextStatus = 502;
    nextBody = null;

    const result = await runCli([baseUrl, 'staging']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('502');
  }, TIMEOUT_MS + 2_000);

  it('exits 1 and mentions "niet bereiken" when the server cannot be reached', async () => {
    // Port 1 on localhost is reserved/unassigned, so the connection is refused immediately
    // instead of the test waiting on a real timeout.
    const result = await runCli(['http://127.0.0.1:1', 'staging']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('niet bereiken');
  }, TIMEOUT_MS + 2_000);

  it('exits 2 with usage text when arguments are missing', async () => {
    const result = await runCli([]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Gebruik: tsx scripts/check-migrations.ts');
  }, TIMEOUT_MS + 2_000);
});
