import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow, updateRow, listRows, getRow, parseJsonKolom } from '@/lib/server/crud';
import { controleerKolommen } from '@/lib/server/tableColumns';

const createdSegmentIds: string[] = [];
const createdKlantIds: string[] = [];

afterEach(async () => {
  if (createdSegmentIds.length > 0) {
    await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [createdSegmentIds]);
    createdSegmentIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
    createdKlantIds.length = 0;
  }
});

describe('kolom-allowlist', () => {
  it('accepteert de kolommen die in db/schema.sql staan', () => {
    expect(() => controleerKolommen('segmenten', ['id', 'omschrijving'])).not.toThrow();
  });

  it('weigert een kolom die niet in de tabel bestaat', () => {
    expect(() => controleerKolommen('segmenten', ['id', 'verzonnen'])).toThrow(/Onbekende kolom/);
  });

  it('weigert een kolomnaam die uit zijn backticks probeert te breken', () => {
    expect(() => controleerKolommen('segmenten', ['id`) SELECT 1 -- '])).toThrow(/Onbekende kolom/);
  });

  it('weigert een tabel die helemaal niet in de registratie staat', () => {
    expect(() => controleerKolommen('sessions', ['id'])).toThrow(/Onbekende tabel/);
  });

  it('laat insertRow gooien in plaats van een gemanipuleerde kolomnaam te gebruiken', async () => {
    await expect(
      insertRow('segmenten', { omschrijving: 'AUTOTEST', ['x`, `y']: 1 } as never)
    ).rejects.toThrow(/Onbekende kolom/);
  });

  it('laat updateRow gooien op een onbekende kolom', async () => {
    const segment = await insertRow<{ id: string }>('segmenten', { omschrijving: 'AUTOTEST crud' } as never);
    createdSegmentIds.push(segment.id);
    await expect(updateRow('segmenten', segment.id, { verzonnen: 1 })).rejects.toThrow(/Onbekende kolom/);
  });
});

describe('verborgen kolommen', () => {
  it('geeft de wachtwoordhash van een klant niet terug via listRows of getRow', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: `crudtest-${Date.now()}@example.com`,
      wachtwoordHash: 'zout:geheim',
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);

    const enkel = await getRow<Record<string, unknown>>('klanten', klant.id);
    expect(enkel).not.toBeNull();
    expect(enkel).not.toHaveProperty('wachtwoordHash');
    expect(enkel?.email).toContain('crudtest-');

    const alle = await listRows<Record<string, unknown>>('klanten');
    const gevonden = alle.find((rij) => rij.id === klant.id);
    expect(gevonden).toBeDefined();
    expect(gevonden).not.toHaveProperty('wachtwoordHash');
  });
});

describe('parseJsonKolom', () => {
  it('parseert een JSON-string', () => {
    expect(parseJsonKolom('["a","b"]', [])).toEqual(['a', 'b']);
  });

  it('laat een al geparseerde waarde staan', () => {
    expect(parseJsonKolom(['a'], [])).toEqual(['a']);
  });

  it('valt terug op de fallback bij null', () => {
    expect(parseJsonKolom(null, [])).toEqual([]);
  });

  it('valt terug op de fallback bij kapotte JSON in plaats van te gooien', () => {
    expect(parseJsonKolom('{niet echt json', [])).toEqual([]);
  });
});
