import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { insertRow } from '@/lib/server/crud';
import { GET as listDrukkers, POST as createDrukker } from '@/app/api/drukkers/route';
import {
  GET as getDrukker,
  PATCH as patchDrukker,
  DELETE as deleteDrukker,
} from '@/app/api/drukkers/[id]/route';

// Tracks the exact ids each test creates and removes only those afterward -- never
// a table-wide DELETE -- so this suite is safe to run against a table that already
// holds real drukkers.
const createdDrukkerIds: string[] = [];

afterEach(async () => {
  if (createdDrukkerIds.length > 0) {
    await getPool().query('DELETE FROM drukkers WHERE id IN (?)', [createdDrukkerIds]);
    createdDrukkerIds.length = 0;
  }
});

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie() {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

describe('drukkers routes', () => {
  it('rejects listing without a medewerker session', async () => {
    const response = await listDrukkers(req('GET'));
    expect(response.status).toBe(401);
  });

  it('rejects creating a drukker without a medewerker session', async () => {
    const response = await createDrukker(req('POST', { naam: 'Onbevoegd', email: 'x@y.nl' }));
    expect(response.status).toBe(401);
  });

  it('allows creating, updating and deleting a drukker with a medewerker session', async () => {
    const cookie = await medewerkerCookie();

    const createResponse = await createDrukker(
      req('POST', { naam: 'Drukkerij Bosch', email: 'info@bosch.nl' }, cookie)
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    createdDrukkerIds.push(created.id);

    await patchDrukker(req('PATCH', { naam: 'Drukkerij Bosch BV' }, cookie), {
      params: { id: created.id },
    });
    const getResponse = await getDrukker(req('GET', undefined, cookie), { params: { id: created.id } });
    expect((await getResponse.json()).naam).toBe('Drukkerij Bosch BV');

    await deleteDrukker(req('DELETE', undefined, cookie), { params: { id: created.id } });
    const afterDelete = await getDrukker(req('GET', undefined, cookie), { params: { id: created.id } });
    expect(afterDelete.status).toBe(404);
    createdDrukkerIds.length = 0;
  });

  it('clears standaard on every other drukker when a new drukker is created as standaard', async () => {
    const cookie = await medewerkerCookie();
    const existing = await insertRow<{ id: string }>('drukkers', {
      naam: 'Drukkerij Eerste',
      email: 'eerste@example.com',
      standaard: true,
    } as never);
    createdDrukkerIds.push(existing.id);

    const createResponse = await createDrukker(
      req('POST', { naam: 'Drukkerij Tweede', email: 'tweede@example.com', standaard: true }, cookie)
    );
    const created = await createResponse.json();
    createdDrukkerIds.push(created.id);

    const existingAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: existing.id } });
    expect((await existingAfter.json()).standaard).toBe(false);
    const createdAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: created.id } });
    expect((await createdAfter.json()).standaard).toBe(true);
  });

  it('clears standaard on every other drukker when an existing drukker is patched to standaard', async () => {
    const cookie = await medewerkerCookie();
    const drukkerA = await insertRow<{ id: string }>('drukkers', {
      naam: 'Drukkerij A',
      email: 'a@example.com',
      standaard: true,
    } as never);
    createdDrukkerIds.push(drukkerA.id);
    const drukkerB = await insertRow<{ id: string }>('drukkers', {
      naam: 'Drukkerij B',
      email: 'b@example.com',
      standaard: false,
    } as never);
    createdDrukkerIds.push(drukkerB.id);

    await patchDrukker(req('PATCH', { standaard: true }, cookie), { params: { id: drukkerB.id } });

    const aAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: drukkerA.id } });
    expect((await aAfter.json()).standaard).toBe(false);
    const bAfter = await getDrukker(req('GET', undefined, cookie), { params: { id: drukkerB.id } });
    expect((await bAfter.json()).standaard).toBe(true);
  });
});
