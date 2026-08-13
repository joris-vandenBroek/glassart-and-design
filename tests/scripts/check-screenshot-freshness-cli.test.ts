import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';

// These tests drive the CLI as a real child process (main()), the same approach as
// tests/scripts/check-migrations-cli.test.ts -- the pure vindMogelijkVerouderdeScreenshots()
// function already has full unit coverage in check-screenshot-freshness.test.ts, but main()
// itself (argument handling, the git-diff call, and -- critically -- the try/catch around it
// that keeps a bad ref from failing the process) had none before this file.
//
// IMPORTANT: this uses async spawn(), not spawnSync(), to match the sibling CLI test file's
// documented reasoning (spawnSync would block this process's event loop).
const TIMEOUT_MS = 15_000;

function runCli(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'scripts/check-screenshot-freshness.ts', ...args], { shell: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI hing vast en is na ${TIMEOUT_MS}ms gedood: ${['npx', 'tsx', 'scripts/check-screenshot-freshness.ts', ...args].join(' ')}`));
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

describe('check-screenshot-freshness CLI', () => {
  it('exits 2 with usage text when the vorige-tag argument is missing', async () => {
    const result = await runCli([]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Gebruik: tsx scripts/check-screenshot-freshness.ts <vorige-tag>');
  }, TIMEOUT_MS + 2_000);

  it('exits 0 and reports no stale screenshots when the ref has no diff against itself', async () => {
    // "HEAD" compared against "HEAD" (git diff --name-only HEAD..HEAD) is always an empty
    // diff, regardless of this repo's actual history -- a deterministic no-stale-screenshots
    // case that doesn't depend on what the last real commit touched.
    const result = await runCli(['HEAD']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Geen screenshots lijken verouderd.');
    expect(result.stdout).not.toContain('::warning::');
  }, TIMEOUT_MS + 2_000);

  it('exits 0 with a ::warning:: instead of throwing when the ref cannot be resolved', async () => {
    // This is the case the final review flagged: `git diff` against a nonexistent ref used
    // to throw out of an unguarded execSync call and take the whole process down with a
    // non-zero exit. It now must be caught and downgraded to a warning so the (supposedly
    // non-blocking) staging-deploy step never fails on a bad ref.
    const result = await runCli(['v-bestaat-niet']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning::Kon de screenshot-versheidscontrole niet uitvoeren:');
    expect(result.stdout).not.toContain('Geen screenshots lijken verouderd.');
  }, TIMEOUT_MS + 2_000);
});
