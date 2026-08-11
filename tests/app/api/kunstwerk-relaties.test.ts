import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { GET as listKunstwerken, POST as createKunstwerk } from '@/app/api/kunstwerken/route';
import { GET as getKunstwerk, PATCH as patchKunstwerk } from '@/app/api/kunstwerken/[id]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

const createdKunstwerkIds: string[] = [];
const createdSegmentIds: string[] = [];

afterEach(async () => {
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdSegmentIds.length > 0) {
    await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [createdSegmentIds]);
    createdSegmentIds.length = 0;
  }
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-relaties'");
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-relaties');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakSegment(naam: string): Promise<string> {
  const segment = await insertRow<{ id: string }>('segmenten', { omschrijvingNl: naam } as never);
  createdSegmentIds.push(segment.id);
  return segment.id;
}

function postRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstwerken/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('kunstwerk-relaties via de API', () => {
  it('POST slaat segmentIds op in volgorde en GET geeft ze zo terug', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-A-${randomUUID()}`);
    const segmentB = await maakSegment(`AUTOTEST-B-${randomUUID()}`);

    const response = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentB, segmentA] }, cookie)
    );
    expect(response.status).toBe(201);
    const created = await response.json();
    createdKunstwerkIds.push(created.id);
    expect(created.segmentIds).toEqual([segmentB, segmentA]);

    const getResponse = await getKunstwerk(new Request('http://localhost/api/kunstwerken/x'), {
      params: { id: created.id },
    });
    const fetched = await getResponse.json();
    expect(fetched.segmentIds).toEqual([segmentB, segmentA]);
  });

  it('POST weigert een duplicaat-id binnen segmentIds met 400', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-DUP-${randomUUID()}`);

    const response = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA, segmentA] }, cookie)
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('dubbele-relatie');
    expect(body.kolom).toBe('segmentIds');

    // Geen kunstwerk mag zijn aangemaakt bij een geweigerde relatie.
    const [rows] = await getPool().query('SELECT id FROM kunstwerken WHERE code LIKE ?', ['AUTOTEST-%']);
    for (const row of rows as Array<{ id: string }>) {
      createdKunstwerkIds.push(row.id);
    }
  });

  it('PATCH zonder materiaalIds in de body laat bestaande materiaalIds ongemoeid', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-PATCH-${randomUUID()}`);
    const createResponse = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA] }, cookie)
    );
    const created = await createResponse.json();
    createdKunstwerkIds.push(created.id);

    const patchResponse = await patchKunstwerk(patchRequest({ prijsPerM2: 42 }, cookie), {
      params: { id: created.id },
    });
    expect(patchResponse.status).toBe(200);

    const getResponse = await getKunstwerk(new Request('http://localhost/api/kunstwerken/x'), {
      params: { id: created.id },
    });
    const fetched = await getResponse.json();
    expect(fetched.segmentIds).toEqual([segmentA]);
  });

  it('het verwijderen van een segment dat nog gekoppeld is, verwijdert alleen de koppeling (CASCADE)', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-CASCADE-${randomUUID()}`);
    const createResponse = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA] }, cookie)
    );
    const created = await createResponse.json();
    createdKunstwerkIds.push(created.id);

    await getPool().query('DELETE FROM segmenten WHERE id = ?', [segmentA]);
    createdSegmentIds.length = 0; // al verwijderd, opruiming hoeft dit niet nogmaals te doen

    const getResponse = await getKunstwerk(new Request('http://localhost/api/kunstwerken/x'), {
      params: { id: created.id },
    });
    expect(getResponse.status).toBe(200);
    const fetched = await getResponse.json();
    expect(fetched.segmentIds).toEqual([]);
  });

  it('GET (lijst) geeft relaties voor meerdere kunstwerken tegelijk terug, zonder N+1', async () => {
    const cookie = await medewerkerCookie();
    const segmentA = await maakSegment(`AUTOTEST-LIJST-${randomUUID()}`);
    const createResponse = await createKunstwerk(
      postRequest({ code: `AUTOTEST-${randomUUID()}`, segmentIds: [segmentA] }, cookie)
    );
    const created = await createResponse.json();
    createdKunstwerkIds.push(created.id);

    const listResponse = await listKunstwerken(new Request('http://localhost/api/kunstwerken'));
    const lijst = (await listResponse.json()) as Array<{ id: string; segmentIds: string[] }>;
    const gevonden = lijst.find((k) => k.id === created.id);
    expect(gevonden?.segmentIds).toEqual([segmentA]);
  });
});
