import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as getMatrix, PUT as putMatrix } from '@/app/api/prijsmatrix/route';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
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

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api/prijsmatrix', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('prijsmatrix route', () => {
  it('rejects reading the matrix without a medewerker session', async () => {
    const response = await getMatrix(req('GET'));
    expect(response.status).toBe(401);
  });

  it('rejects writing a prijs without a medewerker session', async () => {
    const response = await putMatrix(req('PUT', { maatId: 'x', materiaalId: 'y', prijs: 100 }));
    expect(response.status).toBe(401);
  });

  it('includes every maat x materiaal combinatie, with prijs null when unset', async () => {
    const maatId = await maakMaat(70, 70);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    const regel = body.prijzen.find((r: { maatId: string; materiaalId: string }) => r.maatId === maatId && r.materiaalId === materiaalId);
    expect(regel.prijs).toBeNull();
  });

  it('upserts a prijs, then reflects it on the next GET', async () => {
    const maatId = await maakMaat(75, 75);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const putResponse = await putMatrix(req('PUT', { maatId, materiaalId, prijs: 250 }, cookie));
    expect(putResponse.status).toBe(200);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    const regel = body.prijzen.find((r: { maatId: string; materiaalId: string }) => r.maatId === maatId && r.materiaalId === materiaalId);
    expect(regel.prijs).toBe(250);

    const updateResponse = await putMatrix(req('PUT', { maatId, materiaalId, prijs: 275 }, cookie));
    expect(updateResponse.status).toBe(200);
    const secondResponse = await getMatrix(req('GET', undefined, cookie));
    const secondBody = await secondResponse.json();
    const secondRegel = secondBody.prijzen.find(
      (r: { maatId: string; materiaalId: string }) => r.maatId === maatId && r.materiaalId === materiaalId
    );
    expect(secondRegel.prijs).toBe(275);
  });

  it('automatically drops a prijsmatrix row when its maat is deleted (FK cascade)', async () => {
    const maatId = await maakMaat(76, 76);
    const materiaalId = await maakMateriaal();
    await getPool().query('INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?)', [
      maatId,
      materiaalId,
      100,
    ]);
    await getPool().query('DELETE FROM maten WHERE id = ?', [maatId]);
    // The maat is already gone -- afterEach's cleanup DELETE for this id is then simply a no-op.
    const [rows] = await getPool().query('SELECT 1 FROM prijsmatrix WHERE maatId = ?', [maatId]);
    expect((rows as unknown[]).length).toBe(0);
  });
});
