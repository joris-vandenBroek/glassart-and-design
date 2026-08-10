import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as getMatrix, PUT as putMatrix } from '@/app/api/prijsmatrix/route';

const createdMaatIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdMateriaalIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  // medewerkerCookie() uses a fixed fake userId (no real medewerker row exists for it), so
  // every call leaves an orphaned `sessions` row nothing else in this file would clean up.
  await pool.query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
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
  const soort = await insertRow<{ id: string }>('materiaalsoorten', { omschrijvingNl: 'Test soort' } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: 4,
    omschrijvingNl: 'Test materiaal',
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

function vindRegel(prijzen: Array<{ maatId: string; materiaalId: string; prijs: number | null }>, maatId: string, materiaalId: string) {
  return prijzen.find((r) => r.maatId === maatId && r.materiaalId === materiaalId);
}

describe('prijsmatrix route', () => {
  it('rejects reading the matrix without a medewerker session', async () => {
    const response = await getMatrix(req('GET'));
    expect(response.status).toBe(401);
  });

  it('rejects writing prijzen without a medewerker session', async () => {
    const response = await putMatrix(req('PUT', { regels: [{ maatId: 'x', materiaalId: 'y', prijs: 100 }] }));
    expect(response.status).toBe(401);
  });

  it('includes every maat x materiaal combinatie, with prijs null when unset', async () => {
    const maatId = await maakMaat(70, 70);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId, materiaalId)?.prijs).toBeNull();
  });

  it('upserts multiple regels in a single bulk PUT call, then reflects them on the next GET', async () => {
    const maatId1 = await maakMaat(75, 75);
    const maatId2 = await maakMaat(80, 80);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    const putResponse = await putMatrix(
      req(
        'PUT',
        {
          regels: [
            { maatId: maatId1, materiaalId, prijs: 250 },
            { maatId: maatId2, materiaalId, prijs: 300 },
          ],
        },
        cookie
      )
    );
    expect(putResponse.status).toBe(200);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId1, materiaalId)?.prijs).toBe(250);
    expect(vindRegel(body.prijzen, maatId2, materiaalId)?.prijs).toBe(300);
  });

  it('updates an existing prijs when the same combinatie is sent again in a later bulk call', async () => {
    const maatId = await maakMaat(85, 85);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();

    await putMatrix(req('PUT', { regels: [{ maatId, materiaalId, prijs: 250 }] }, cookie));
    const updateResponse = await putMatrix(req('PUT', { regels: [{ maatId, materiaalId, prijs: 275 }] }, cookie));
    expect(updateResponse.status).toBe(200);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId, materiaalId)?.prijs).toBe(275);
  });

  it('rolls back the entire batch when one regel is invalid, leaving the valid regel untouched', async () => {
    const maatId = await maakMaat(90, 90);
    const materiaalId = await maakMateriaal();
    const cookie = await medewerkerCookie();
    const nietBestaandeMaatId = randomUUID();

    const putResponse = await putMatrix(
      req(
        'PUT',
        {
          regels: [
            { maatId, materiaalId, prijs: 999 },
            { maatId: nietBestaandeMaatId, materiaalId, prijs: 111 },
          ],
        },
        cookie
      )
    );
    expect(putResponse.status).toBe(500);

    const response = await getMatrix(req('GET', undefined, cookie));
    const body = await response.json();
    expect(vindRegel(body.prijzen, maatId, materiaalId)?.prijs).toBeNull();
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
    const [rows] = await getPool().query('SELECT 1 FROM prijsmatrix WHERE maatId = ?', [maatId]);
    expect((rows as unknown[]).length).toBe(0);
  });
});
