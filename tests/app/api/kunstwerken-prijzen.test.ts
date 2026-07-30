import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { GET as getKunstwerkPrijzen } from '@/app/api/kunstwerken/prijzen/route';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];
const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (createdKunstwerkIds.length > 0) {
    await pool.query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdMaatIds.length > 0) {
    await pool.query('DELETE FROM maten WHERE id IN (?)', [createdMaatIds]);
    createdMaatIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await pool.query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds]);
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await pool.query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds]);
    createdMateriaalsoortIds.length = 0;
  }
});

async function maakMaat(breedte: number, hoogte: number) {
  const maat = await insertRow<{ id: string }>('maten', { breedte, hoogte } as never);
  createdMaatIds.push(maat.id);
  return maat.id;
}

async function maakMateriaal() {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijving: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijving: 'Test materiaal',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

describe('GET /api/kunstwerken/prijzen', () => {
  it('bulk mode: returns computed prijzen keyed by kunstwerkId, without needing auth', async () => {
    const maatId = await maakMaat(41, 61);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      150,
    ]);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { naam: 'Bulk test werk', materiaalIds: [materiaalId], maatIds: [maatId] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await getKunstwerkPrijzen(new Request('http://localhost/api/kunstwerken/prijzen'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[kunstwerk.id]).toEqual([{ maatId, materiaalId, prijs: 150 }]);
  });

  it('ad-hoc mode: returns prijzen for the given materiaalIds x maatIds without a saved kunstwerk', async () => {
    const maatId = await maakMaat(42, 62);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      175,
    ]);

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?materiaalIds=${materiaalId}&maatIds=${maatId}`)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prijzen).toEqual([{ maatId, materiaalId, prijs: 175 }]);
  });

  it('ad-hoc mode: triggers with only materiaalIds param, maatIds absent, returns empty prijzen array', async () => {
    const materiaalId = await maakMateriaal();

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?materiaalIds=${materiaalId}`)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prijzen).toEqual([]);
  });

  it('ad-hoc mode: triggers with only maatIds param, materiaalIds absent, returns empty prijzen array', async () => {
    const maatId = await maakMaat(43, 63);

    const response = await getKunstwerkPrijzen(
      new Request(`http://localhost/api/kunstwerken/prijzen?maatIds=${maatId}`)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prijzen).toEqual([]);
  });
});
