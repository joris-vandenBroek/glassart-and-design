import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { POST as koppelKunstwerken } from '@/app/api/materialen/[id]/koppel-kunstwerken/route';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const createdMateriaalIds: string[] = [];
const createdMateriaalsoortIds: string[] = [];
const createdKunstwerkIds: string[] = [];
let teller = 0;

afterEach(async () => {
  await veiligOpruimen('sessions (medewerker staff-koppel)', () =>
    getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-koppel'")
  );
  if (createdKunstwerkIds.length > 0) {
    // Cascadeert naar kunstwerkMaterialen (ON DELETE CASCADE).
    await veiligOpruimen('kunstwerken (koppel)', () =>
      getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds])
    );
    createdKunstwerkIds.length = 0;
  }
  if (createdMateriaalIds.length > 0) {
    await veiligOpruimen('materialen (koppel)', () =>
      getPool().query('DELETE FROM materialen WHERE id IN (?)', [createdMateriaalIds])
    );
    createdMateriaalIds.length = 0;
  }
  if (createdMateriaalsoortIds.length > 0) {
    await veiligOpruimen('materiaalsoorten (koppel)', () =>
      getPool().query('DELETE FROM materiaalsoorten WHERE id IN (?)', [createdMateriaalsoortIds])
    );
    createdMateriaalsoortIds.length = 0;
  }
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-koppel');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function postRequest(cookie?: string) {
  return new Request('http://localhost/api/materialen/x/koppel-kunstwerken', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
}

async function maakMateriaal(): Promise<string> {
  const soort = await insertRow<{ id: string }>('materiaalsoorten', {
    omschrijvingNl: 'AUTOTEST Soort koppel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalsoortIds.push(soort.id);
  const materiaal = await insertRow<{ id: string }>('materialen', {
    materiaalsoortId: soort.id,
    materiaaldikte: ++teller,
    omschrijvingNl: 'AUTOTEST Materiaal koppel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdMateriaalIds.push(materiaal.id);
  return materiaal.id;
}

async function maakKunstwerk(materiaalIds: string[]): Promise<string> {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
    code: `AUTOTEST-KOPPEL-${++teller}`,
    foto: '',
    omschrijvingNl: 'AUTOTEST Kunstwerk',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  for (const [volgorde, materiaalId] of materiaalIds.entries()) {
    await getPool().query(
      'INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde) VALUES (?, ?, ?)',
      [kunstwerk.id, materiaalId, volgorde]
    );
  }
  return kunstwerk.id;
}

async function gekoppeldeMaterialen(kunstwerkId: string): Promise<string[]> {
  const [rows] = await getPool().query(
    'SELECT materiaalId FROM kunstwerkMaterialen WHERE kunstwerkId = ? ORDER BY volgorde',
    [kunstwerkId]
  );
  return (rows as Array<{ materiaalId: string }>).map((row) => row.materiaalId);
}

describe('POST /api/materialen/[id]/koppel-kunstwerken', () => {
  it('koppelt het materiaal aan kunstwerken die al materialen hebben', async () => {
    const cookie = await medewerkerCookie();
    const bestaand = await maakMateriaal();
    const nieuw = await maakMateriaal();
    const kunstwerkId = await maakKunstwerk([bestaand]);

    const response = await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });
    expect(response.status).toBe(200);

    expect(await gekoppeldeMaterialen(kunstwerkId)).toEqual([bestaand, nieuw]);
  });

  it('slaat materiaalloze kunstwerken over', async () => {
    const cookie = await medewerkerCookie();
    const nieuw = await maakMateriaal();
    const materiaalloosId = await maakKunstwerk([]);

    await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });

    expect(await gekoppeldeMaterialen(materiaalloosId)).toEqual([]);
  });

  it('is herhaalbaar en telt alleen nieuwe koppelingen', async () => {
    const cookie = await medewerkerCookie();
    const bestaand = await maakMateriaal();
    const nieuw = await maakMateriaal();
    const kunstwerkId = await maakKunstwerk([bestaand]);

    const eerste = await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });
    expect((await eerste.json()).gekoppeld).toBeGreaterThanOrEqual(1);

    const tweede = await koppelKunstwerken(postRequest(cookie), { params: { id: nieuw } });
    expect((await tweede.json()).gekoppeld).toBe(0);

    expect(await gekoppeldeMaterialen(kunstwerkId)).toEqual([bestaand, nieuw]);
  });

  it('weigert zonder medewerkersessie', async () => {
    const response = await koppelKunstwerken(postRequest(), { params: { id: 'x' } });
    expect(response.status).toBe(401);
  });
});
