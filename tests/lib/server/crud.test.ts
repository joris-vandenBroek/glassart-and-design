import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { listRows, getRow, insertRow, updateRow, deleteRow, parseJsonKolom } from '@/lib/server/crud';
import { controleerKolommen } from '@/lib/server/tableColumns';

// Every test tracks the exact ids it creates and removes only those afterward --
// never a table-wide DELETE -- so this suite is safe to run against a segmenten/
// kunstenaars table that already holds real data (migrated or entered via the app).
const createdSegmentIds: string[] = [];
const createdKunstenaarIds: string[] = [];
const createdKlantIds: string[] = [];

afterEach(async () => {
  if (createdSegmentIds.length > 0) {
    await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [createdSegmentIds]);
    createdSegmentIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
    createdKlantIds.length = 0;
  }
});

describe('generic CRUD helpers (against segmenten table)', () => {
  it('inserts and lists a row', async () => {
    const created = await insertRow<{ id: string; omschrijvingNl: string }>('segmenten', {
      omschrijvingNl: 'Hotel',
    });
    createdSegmentIds.push(created.id);
    expect(created.omschrijvingNl).toBe('Hotel');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await listRows<{ id: string; omschrijvingNl: string }>('segmenten');
    // De rij komt terug met de volledige kolomset (omschrijvingFr/De/En, hier
    // niet gezet en dus null) -- objectContaining, niet een volledige match,
    // want `created` bevat alleen wat deze test zelf heeft meegegeven.
    expect(rows).toContainEqual(expect.objectContaining(created));
  });

  it('gets a single row by id', async () => {
    const created = await insertRow<{ id: string; omschrijvingNl: string }>('segmenten', {
      omschrijvingNl: 'Restaurant',
    });
    createdSegmentIds.push(created.id);
    const found = await getRow<{ id: string; omschrijvingNl: string }>('segmenten', created.id);
    expect(found).toEqual(expect.objectContaining(created));
  });

  it('returns null when getRow finds nothing', async () => {
    const found = await getRow('segmenten', 'non-existent-id');
    expect(found).toBeNull();
  });

  it('updates a row', async () => {
    const created = await insertRow<{ id: string; omschrijvingNl: string }>('segmenten', {
      omschrijvingNl: 'Kantoor',
    });
    createdSegmentIds.push(created.id);
    await updateRow('segmenten', created.id, { omschrijvingNl: 'Kantoorpand' });
    const found = await getRow<{ id: string; omschrijvingNl: string }>('segmenten', created.id);
    expect(found?.omschrijvingNl).toBe('Kantoorpand');
  });

  it('deletes a row', async () => {
    const created = await insertRow<{ id: string; omschrijvingNl: string }>('segmenten', {
      omschrijvingNl: 'Winkel',
    });
    await deleteRow('segmenten', created.id);
    const found = await getRow('segmenten', created.id);
    expect(found).toBeNull();
  });

  it('serializes and deserializes JSON columns', async () => {
    const created = await insertRow<{ id: string; kunstenaarnr: string; exclusieveKlantIds: string[] }>(
      'kunstenaars',
      { kunstenaarnr: 'AT-K-CRUD-1', naam: 'Test Crud Json', exclusieveKlantIds: ['a', 'b'] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(created.id);
    expect(created.exclusieveKlantIds).toEqual(['a', 'b']);
    const found = await getRow<{ id: string; exclusieveKlantIds: string[] }>(
      'kunstenaars',
      created.id,
      ['exclusieveKlantIds']
    );
    expect(found?.exclusieveKlantIds).toEqual(['a', 'b']);
  });

  it('defaults a NULL JSON column to an empty array instead of returning null', async () => {
    const created = await insertRow<{ id: string; kunstenaarnr: string }>(
      'kunstenaars',
      { kunstenaarnr: 'AT-K-CRUD-2', naam: 'Test Crud Zonder Klanten' } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(created.id);

    const found = await getRow<{ id: string; exclusieveKlantIds: string[] }>(
      'kunstenaars',
      created.id,
      ['exclusieveKlantIds']
    );
    expect(found?.exclusieveKlantIds).toEqual([]);

    const rows = await listRows<{ id: string; exclusieveKlantIds: string[] }>('kunstenaars', [
      'exclusieveKlantIds',
    ]);
    expect(rows.find((row) => row.id === created.id)?.exclusieveKlantIds).toEqual([]);
  });
});

// De kolomnamen van een schrijfactie komen uit de sleutels van een request-body
// en belanden als identifier in de SQL -- identifiers kunnen niet
// geparameteriseerd worden. Deze allowlist is wat dat afgrenst.
describe('kolom-allowlist', () => {
  it('accepteert de kolommen die in db/schema.sql staan', () => {
    expect(() => controleerKolommen('segmenten', ['id', 'omschrijvingNl'])).not.toThrow();
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
      insertRow('segmenten', { omschrijvingNl: 'AUTOTEST', ['x`, `y']: 1 } as never)
    ).rejects.toThrow(/Onbekende kolom/);
  });

  it('laat updateRow gooien op een onbekende kolom', async () => {
    const segment = await insertRow<{ id: string }>('segmenten', { omschrijvingNl: 'AUTOTEST crud' } as never);
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
