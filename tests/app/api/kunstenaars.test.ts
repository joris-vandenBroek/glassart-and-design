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
      { naam: 'Anna', exclusieveKlantIds: [] } as never,
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

  it('round-trips exclusieveKlantIds as a JSON array, not a string', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const created = await createKunstenaar(
      req('POST', { naam: 'Eva', exclusieveKlantIds: ['klant-a', 'klant-b'] }, cookie)
    );
    const body = await created.json();
    createdKunstenaarIds.push(body.id);

    const getResponse = await getKunstenaar(req('GET'), { params: { id: body.id } });
    expect((await getResponse.json()).exclusieveKlantIds).toEqual(['klant-a', 'klant-b']);
  });

  it('stores and retrieves prijsafspraken only for staff, keyed by the kunstenaar id', async () => {
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Dana', exclusieveKlantIds: [] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const putResponse = await putAfspraken(
      req('PUT', { prijsafspraken: '50/50 split' }, cookie),
      { params: { id: kunstenaar.id } }
    );
    expect(putResponse.status).toBe(200);

    const getResponse = await getAfspraken(req('GET', undefined, cookie), {
      params: { id: kunstenaar.id },
    });
    expect((await getResponse.json()).prijsafspraken).toBe('50/50 split');

    const unauthenticated = await getAfspraken(req('GET'), { params: { id: kunstenaar.id } });
    expect(unauthenticated.status).toBe(401);
  });
});
