import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { GET as listKunstenaars, POST as createKunstenaar } from '@/app/api/kunstenaars/route';
import {
  GET as getKunstenaar,
  PATCH as patchKunstenaar,
  DELETE as deleteKunstenaar,
} from '@/app/api/kunstenaars/[id]/route';
import {
  GET as getAfspraken,
  PUT as putAfspraken,
} from '@/app/api/kunstenaarAfspraken/[id]/route';

// Tracks the exact ids each test creates and removes only those afterward -- never
// a table-wide DELETE -- so this suite is safe to run against tables that already
// hold real kunstenaars/kunstwerken. kunstenaarAfspraken cleans up automatically via
// its ON DELETE CASCADE foreign key to kunstenaars.id.
const createdKunstenaarIds: string[] = [];
const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  // createSession('medewerker', 'staff-1') uses a fixed fake userId (no real medewerker
  // row exists for it), so every call leaves an orphaned `sessions` row.
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
});

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('kunstenaars + kunstenaarAfspraken routes', () => {
  it('lists kunstenaars publicly, without ever exposing prijsafspraken', async () => {
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { kunstenaarnr: 'AT-K-KUN-2', naam: 'Anna', exclusieveKlantIds: [] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const response = await listKunstenaars(req('GET'));
    const body = await response.json();
    const found = body.find((row: { id: string }) => row.id === kunstenaar.id);
    expect(found.naam).toBe('Anna');
    expect(found.prijsafspraken).toBeUndefined();
  });

  it('rejects creating a kunstenaar without a medewerker session', async () => {
    const response = await createKunstenaar(req('POST', { naam: 'Bram', exclusieveKlantIds: [] }));
    expect(response.status).toBe(401);
  });

  it('allows creating, updating and deleting a kunstenaar with a medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const createResponse = await createKunstenaar(
      req('POST', { naam: 'Chris', exclusieveKlantIds: [] }, cookie)
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    await patchKunstenaar(req('PATCH', { naam: 'Christiaan' }, cookie), {
      params: { id: created.id },
    });
    const getResponse = await getKunstenaar(req('GET'), { params: { id: created.id } });
    expect((await getResponse.json()).naam).toBe('Christiaan');

    await deleteKunstenaar(req('DELETE', undefined, cookie), { params: { id: created.id } });
    const afterDelete = await getKunstenaar(req('GET'), { params: { id: created.id } });
    expect(afterDelete.status).toBe(404);
  });

  it('blocks deleting a kunstenaar still referenced by a kunstwerk, allows it once unreferenced', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { kunstenaarnr: 'AT-K-KUN-3', naam: 'Referenced Artiest', exclusieveKlantIds: [] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerk = await insertRow<{ id: string }>(
      'kunstwerken',
      { code: 'test-kunstenaars-referenced', kunstenaarId: kunstenaar.id, materiaalIds: [], maatIds: [] } as never,
      ['materiaalIds', 'maatIds']
    );
    createdKunstwerkIds.push(kunstwerk.id);

    const blocked = await deleteKunstenaar(req('DELETE', undefined, cookie), { params: { id: kunstenaar.id } });
    expect(blocked.status).toBe(409);
    const body = await blocked.json();
    expect(body.error).toBe('in-use');
    const stillThere = await getKunstenaar(req('GET'), { params: { id: kunstenaar.id } });
    expect(stillThere.status).toBe(200);

    await getPool().query('DELETE FROM kunstwerken WHERE id = ?', [kunstwerk.id]);
    createdKunstwerkIds.length = 0;
    const allowed = await deleteKunstenaar(req('DELETE', undefined, cookie), { params: { id: kunstenaar.id } });
    expect(allowed.status).toBe(200);
    createdKunstenaarIds.length = 0;
  });

  it('round-trips exclusieveKlantIds as a JSON array, not a string', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const created = await createKunstenaar(
      req('POST', { naam: 'Eva', exclusieveKlantIds: ['klant-a', 'klant-b'] }, cookie)
    );
    const body = await created.json();
    createdKunstenaarIds.push(body.id);

    const getResponse = await getKunstenaar(req('GET', undefined, cookie), { params: { id: body.id } });
    expect((await getResponse.json()).exclusieveKlantIds).toEqual(['klant-a', 'klant-b']);
  });

  // De collectiepagina is publiek, dus deze lijst met klant-UUID's lag mee op
  // straat. `resolveOrderRight` heeft er maar twee dingen uit nodig -- is de
  // lijst leeg, en sta ik erin -- en die blijven na redactie kloppen.
  it('verbergt voor een publieke lezer wélke klanten exclusief zijn, maar niet dát het exclusief is', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const created = await createKunstenaar(
      req('POST', { naam: 'Fenna', exclusieveKlantIds: ['klant-a', 'klant-b'] }, cookie)
    );
    const body = await created.json();
    createdKunstenaarIds.push(body.id);

    const publiek = await (
      await getKunstenaar(req('GET'), { params: { id: body.id } })
    ).json();
    expect(publiek.exclusieveKlantIds).not.toContain('klant-a');
    expect(publiek.exclusieveKlantIds).not.toContain('klant-b');
    // Nog steeds niet-leeg, anders zou het werk ineens voor iedereen bestelbaar lijken.
    expect(publiek.exclusieveKlantIds.length).toBeGreaterThan(0);
  });

  it('laat een niet-exclusieve kunstenaar publiek een lege lijst houden', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const created = await createKunstenaar(req('POST', { naam: 'Gijs', exclusieveKlantIds: [] }, cookie));
    const body = await created.json();
    createdKunstenaarIds.push(body.id);

    const publiek = await (await listKunstenaars(req('GET'))).json();
    const gevonden = publiek.find((rij: { id: string }) => rij.id === body.id);
    expect(gevonden.exclusieveKlantIds).toEqual([]);
  });

  it('stores and retrieves prijsafspraken and prijsopslag only for staff, keyed by the kunstenaar id', async () => {
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { kunstenaarnr: 'AT-K-KUN-4', naam: 'Dana', exclusieveKlantIds: [] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const putResponse = await putAfspraken(
      req('PUT', { prijsafspraken: '50/50 split', prijsopslag: 35 }, cookie),
      { params: { id: kunstenaar.id } }
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await getAfspraken(req('GET', undefined, cookie), {
      params: { id: kunstenaar.id },
    });
    const body = await getResponse.json();
    expect(body.prijsafspraken).toBe('50/50 split');
    expect(body.prijsopslag).toBe(35);

    const unauthenticated = await getAfspraken(req('GET'), { params: { id: kunstenaar.id } });
    expect(unauthenticated.status).toBe(401);
  });

  it('defaults prijsopslag to 0 for a kunstenaar with no kunstenaarAfspraken row yet', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      kunstenaarnr: 'AT-K-KUN-1',
      naam: 'Erik',
    } as never);
    createdKunstenaarIds.push(kunstenaar.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const response = await getAfspraken(req('GET', undefined, cookie), { params: { id: kunstenaar.id } });
    const body = await response.json();
    expect(body.prijsopslag).toBe(0);
  });
});
