import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { listRows, getRow, insertRow, updateRow, deleteRow } from '@/lib/server/crud';

// Every test tracks the exact ids it creates and removes only those afterward --
// never a table-wide DELETE -- so this suite is safe to run against a segmenten/
// kunstwerken table that already holds real data (migrated or entered via the app).
const createdSegmentIds: string[] = [];
const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  if (createdSegmentIds.length > 0) {
    await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [createdSegmentIds]);
    createdSegmentIds.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
});

describe('generic CRUD helpers (against segmenten table)', () => {
  it('inserts and lists a row', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Hotel',
    });
    createdSegmentIds.push(created.id);
    expect(created.omschrijving).toBe('Hotel');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await listRows<{ id: string; omschrijving: string }>('segmenten');
    expect(rows).toContainEqual(created);
  });

  it('gets a single row by id', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Restaurant',
    });
    createdSegmentIds.push(created.id);
    const found = await getRow<{ id: string; omschrijving: string }>('segmenten', created.id);
    expect(found).toEqual(created);
  });

  it('returns null when getRow finds nothing', async () => {
    const found = await getRow('segmenten', 'non-existent-id');
    expect(found).toBeNull();
  });

  it('updates a row', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Kantoor',
    });
    createdSegmentIds.push(created.id);
    await updateRow('segmenten', created.id, { omschrijving: 'Kantoorpand' });
    const found = await getRow<{ id: string; omschrijving: string }>('segmenten', created.id);
    expect(found?.omschrijving).toBe('Kantoorpand');
  });

  it('deletes a row', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Winkel',
    });
    await deleteRow('segmenten', created.id);
    const found = await getRow('segmenten', created.id);
    expect(found).toBeNull();
  });

  it('serializes and deserializes JSON columns', async () => {
    const created = await insertRow<{ id: string; naam: string; segmentIds: string[] }>(
      'kunstwerken',
      { naam: 'Test', segmentIds: ['a', 'b'] } as never,
      ['segmentIds', 'materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(created.id);
    expect(created.segmentIds).toEqual(['a', 'b']);
    const found = await getRow<{ id: string; segmentIds: string[] }>(
      'kunstwerken',
      created.id,
      ['segmentIds', 'materiaalIds', 'maatIds']
    );
    expect(found?.segmentIds).toEqual(['a', 'b']);
  });

  it('defaults a NULL JSON column to an empty array instead of returning null', async () => {
    const created = await insertRow<{ id: string; naam: string }>(
      'kunstwerken',
      { naam: 'Zonder materialen' } as never,
      ['segmentIds', 'materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(created.id);

    const found = await getRow<{ id: string; materiaalIds: string[] }>(
      'kunstwerken',
      created.id,
      ['segmentIds', 'materiaalIds', 'maatIds']
    );
    expect(found?.materiaalIds).toEqual([]);

    const rows = await listRows<{ id: string; materiaalIds: string[] }>('kunstwerken', [
      'segmentIds',
      'materiaalIds',
      'maatIds',
    ]);
    expect(rows.find((row) => row.id === created.id)?.materiaalIds).toEqual([]);
  });
});
