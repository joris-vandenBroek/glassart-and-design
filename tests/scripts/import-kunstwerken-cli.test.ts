import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

// SAFETY: elke case hier is een argumentvalidatie-weigering die moet stoppen VOORDAT
// scripts/import-kunstwerken-cli.ts ooit fetch() aanroept -- geen enkele case mag een
// echte staging/productie-aanroep doen. Zelfde bedoeling als tests/scripts/db-migrate-cli.test.ts.
//
// Deliberately spawns `node <resolved tsx cli path>` instead of `npx tsx` via a shell:
// `spawnSync(..., { shell: true })` does not escape its arguments (Node's own DEP0190
// warning), so a JSON-array-with-quotes argument like `--bestaande-codes-json` below gets
// corrupted by the shell's own quote parsing before this CLI ever sees it. Resolving tsx's
// own bin script and invoking it via `node` (a real executable, not a .cmd/.bat wrapper)
// sidesteps the need for a shell entirely.
const require = createRequire(import.meta.url);
const TSX_CLI = path.join(path.dirname(require.resolve('tsx/package.json')), require('tsx/package.json').bin);
const TIMEOUT_MS = 15_000;

function runCli(args: string[]) {
  return spawnSync('node', [TSX_CLI, 'scripts/import-kunstwerken-cli.ts', ...args], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
}

describe('import-kunstwerken-cli argumentvalidatie', () => {
  it('weigert een onbekend subcommando met gebruikstekst', () => {
    const result = runCli(['frobnicate']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Gebruik:');
  });

  it('weigert een kapotte vlag (geen --prefix) met exitcode 2, zoals elke andere weigering', () => {
    const result = runCli(['login', 'zonder-dashes']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Ongeldig argument');
  });

  it('weigert login zonder --omgeving', () => {
    const result = runCli(['login']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--omgeving is verplicht');
  });

  it('weigert login met een onbekende omgeving', () => {
    const result = runCli(['login', '--omgeving', 'test']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("moet 'staging' of 'productie' zijn");
  });

  it('weigert analyseer-foto zonder --pad', () => {
    const result = runCli(['analyseer-foto']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--pad is verplicht');
  });

  it('weigert maak-lookup-waarde met een onbekende --tabel', () => {
    const result = runCli([
      'maak-lookup-waarde',
      '--omgeving',
      'staging',
      '--sessie-cookie',
      'session_id=x',
      '--tabel',
      'foo',
      '--omschrijving-nl',
      'Afrika',
      '--omschrijving-fr',
      'Afrique',
      '--omschrijving-de',
      'Afrika',
      '--omschrijving-en',
      'Africa',
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('moet segmenten, stijlen of categorieen zijn');
  });

  it('weigert maak-lookup-waarde zonder --omschrijving-nl', () => {
    const result = runCli([
      'maak-lookup-waarde',
      '--omgeving',
      'staging',
      '--sessie-cookie',
      'session_id=x',
      '--tabel',
      'segmenten',
      '--omschrijving-fr',
      'Afrique',
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--omschrijving-nl is verplicht');
  });

  it('weigert maak-kunstwerk zonder --json en zonder --json-bestand', () => {
    const result = runCli(['maak-kunstwerk', '--omgeving', 'staging', '--sessie-cookie', 'session_id=x']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--json-bestand');
    expect(result.stderr).toContain('--json');
  });

  it('weigert maak-kunstenaar zonder --json en zonder --json-bestand', () => {
    const result = runCli(['maak-kunstenaar', '--omgeving', 'staging', '--sessie-cookie', 'session_id=x']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--json-bestand');
    expect(result.stderr).toContain('--json');
  });

  it('weigert download-bestand zonder --url', () => {
    const result = runCli(['download-bestand', '--naar', 'foo.jpg']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--url is verplicht');
  });

  it('weigert download-bestand zonder --naar', () => {
    const result = runCli(['download-bestand', '--url', 'https://example.com/foto.jpg']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--naar is verplicht');
  });

  it('weigert maak-kunstenaar zonder --omgeving', () => {
    const result = runCli(['maak-kunstenaar']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--omgeving is verplicht');
  });
});

describe('import-kunstwerken-cli netwerkloze subcommando\'s', () => {
  it('volgende-code print de eerstvolgende code', () => {
    const result = runCli(['volgende-code', '--prefix', 'GLA-PRO', '--bestaande-codes-json', '["GLA-PRO-001"]']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('GLA-PRO-002');
  });

  it('analyseer-foto print breedte, hoogte en formaat van een echt bestand', () => {
    const result = runCli(['analyseer-foto', '--pad', 'tests/fixtures/images/staand-60x90.png']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ breedte: 60, hoogte: 90, formaat: 'staand' });
  });

  it('kies-maten print de bij het formaat passende maat-id\'s', () => {
    const matenJson = JSON.stringify([
      { id: 'a', breedte: 60, hoogte: 90 },
      { id: 'b', breedte: 90, hoogte: 60 },
    ]);
    const result = runCli(['kies-maten', '--formaat', 'staand', '--maten-json', matenJson]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['a']);
  });
});
