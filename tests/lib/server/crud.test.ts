import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { listRows, getRow, insertRow, updateRow, deleteRow } from '@/lib/server/crud';

beforeEach(async () => {
  await getPool().query('DELETE FROM segmenten');
});

describe('generic CRUD helpers (against segmenten table)', () => {
  it('inserts and lists a row', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Hotel',
    });
    expect(created.omschrijving).toBe('Hotel');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await listRows<{ id: string; omschrijving: string }>('segmenten');
    expect(rows).toEqual([created]);
  });

  it('gets a single row by id', async () => {
    const created = await insertRow<{ id: string; omschrijving: string }>('segmenten', {
      omschrijving: 'Restaurant',
    });
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
    await getPool().query('DELETE FROM kunstwerken');
    const created = await insertRow<{ id: string; naam: string; segmentIds: string[] }>(
      'kunstwerken',
      { naam: 'Test', artiest: '', segmentIds: ['a', 'b'] } as never,
      ['segmentIds', 'materiaalIds', 'maatIds', 'prijzen']
    );
    expect(created.segmentIds).toEqual(['a', 'b']);
    const found = await getRow<{ id: string; segmentIds: string[] }>(
      'kunstwerken',
      created.id,
      ['segmentIds', 'materiaalIds', 'maatIds', 'prijzen']
    );
    expect(found?.segmentIds).toEqual(['a', 'b']);
  });
});
