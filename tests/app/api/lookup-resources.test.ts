import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listResource, POST as createResource } from '@/app/api/[resource]/route';
import {
  GET as getResource,
  PATCH as patchResource,
  DELETE as deleteResource,
} from '@/app/api/[resource]/[id]/route';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';

// Tracks the exact ids each test creates and removes only those afterward -- never
// a table-wide DELETE. Previously "gets, updates and deletes a single segment" blindly
// took listResponse.json()[0] as "the row just created", which is only safe on an
// empty table -- against a segmenten table with real data, that would have PATCHed/
// DELETEd an arbitrary real segment instead. Always resolve the id from the POST
// response instead of list ordering.
const createdSegmentIds: string[] = [];

afterEach(async () => {
  if (createdSegmentIds.length > 0) {
    await getPool().query('DELETE FROM segmenten WHERE id IN (?)', [createdSegmentIds]);
    createdSegmentIds.length = 0;
  }
});

function jsonRequest(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api/segmenten', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

async function maakBestellijnVoorMaat(maatId: string): Promise<{ headerId: string; klantEmail: string }> {
  const klantEmail = `bestellijn-guard-${maatId}@example.com`;
  const klant = await insertRow<{ id: string }>('klanten', {
    email: klantEmail,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
  } as never);
  const header = await insertRow<{ id: string }>('bestelheaders', {
    klantId: klant.id,
    bestelnr: 'GD-TEST',
    status: 'Te beoordelen',
  } as never);
  await insertRow<{ id: string }>('bestellines', {
    bestelheaderId: header.id,
    maatId,
    quantity: 1,
  } as never);
  return { headerId: header.id, klantEmail };
}

describe('generic lookup-resource routes', () => {
  it('creates then lists a segment', async () => {
    const createResponse = await createResource(
      jsonRequest('POST', { omschrijving: 'Hotel' }, await medewerkerCookie()),
      { params: { resource: 'segmenten' } }
    );
    const created = await createResponse.json();
    createdSegmentIds.push(created.id);

    const response = await listResource(jsonRequest('GET'), { params: { resource: 'segmenten' } });
    const body = await response.json();
    const found = body.find((row: { id: string }) => row.id === created.id);
    expect(found.omschrijving).toBe('Hotel');
  });

  it('rejects writing a segment without a medewerker session', async () => {
    const response = await createResource(jsonRequest('POST', { omschrijving: 'Hack' }), {
      params: { resource: 'segmenten' },
    });
    expect(response.status).toBe(401);
  });

  it('rejects an unknown resource with 404', async () => {
    const response = await listResource(jsonRequest('GET'), { params: { resource: 'klanten' } });
    expect(response.status).toBe(404);
  });

  it('rejects reading a staff-only resource (drukkers) without a medewerker session', async () => {
    const response = await listResource(
      new Request('http://localhost/api/drukkers', { method: 'GET' }),
      { params: { resource: 'drukkers' } }
    );
    expect(response.status).toBe(401);
  });

  it('allows reading drukkers with a valid medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const response = await listResource(
      new Request('http://localhost/api/drukkers', {
        method: 'GET',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` },
      }),
      { params: { resource: 'drukkers' } }
    );
    expect(response.status).toBe(200);
  });

  it('gets, updates and deletes a single segment', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(
      jsonRequest('POST', { omschrijving: 'Restaurant' }, cookie),
      { params: { resource: 'segmenten' } }
    );
    const created = await createResponse.json();

    const getResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await getResponse.json()).omschrijving).toBe('Restaurant');

    await patchResource(jsonRequest('PATCH', { omschrijving: 'Restaurantpand' }, cookie), {
      params: { resource: 'segmenten', id: created.id },
    });
    const updatedResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await updatedResponse.json()).omschrijving).toBe('Restaurantpand');

    await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'segmenten', id: created.id },
    });
    const afterDelete = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(afterDelete.status).toBe(404);
  });

  it('rejects updating or deleting a segment without a medewerker session', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(
      jsonRequest('POST', { omschrijving: 'Kantoor' }, cookie),
      { params: { resource: 'segmenten' } }
    );
    const created = await createResponse.json();
    createdSegmentIds.push(created.id);

    const patchResponse = await patchResource(jsonRequest('PATCH', { omschrijving: 'Hack' }), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(patchResponse.status).toBe(401);

    const deleteResponse = await deleteResource(jsonRequest('DELETE'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(deleteResponse.status).toBe(401);
  });

  it('rejects writing a fully staff-only resource (prijsgroepen) without a medewerker session', async () => {
    const readResponse = await listResource(
      new Request('http://localhost/api/prijsgroepen', { method: 'GET' }),
      { params: { resource: 'prijsgroepen' } }
    );
    expect(readResponse.status).toBe(401);

    const writeResponse = await createResource(
      new Request('http://localhost/api/prijsgroepen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ naam: 'Hack', kortingspercentage: 100 }),
      }),
      { params: { resource: 'prijsgroepen' } }
    );
    expect(writeResponse.status).toBe(401);
  });

  it('rejects deleting a maat that is still referenced by a bestellijn, even if no kunstwerk uses it', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(jsonRequest('POST', { breedte: 12, hoogte: 34 }, cookie), {
      params: { resource: 'maten' },
    });
    const created = await createResponse.json();
    const { headerId, klantEmail } = await maakBestellijnVoorMaat(created.id);

    const deleteResponse = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'maten', id: created.id },
    });
    expect(deleteResponse.status).toBe(409);

    await getPool().query('DELETE FROM bestelheaders WHERE id = ?', [headerId]);
    await getPool().query('DELETE FROM klanten WHERE email = ?', [klantEmail]);
    await getPool().query('DELETE FROM maten WHERE id = ?', [created.id]);
  });

  it('allows deleting a maat that has never been used in a bestellijn', async () => {
    const cookie = await medewerkerCookie();
    const createResponse = await createResource(jsonRequest('POST', { breedte: 13, hoogte: 35 }, cookie), {
      params: { resource: 'maten' },
    });
    const created = await createResponse.json();

    const deleteResponse = await deleteResource(jsonRequest('DELETE', undefined, cookie), {
      params: { resource: 'maten', id: created.id },
    });
    expect(deleteResponse.status).toBe(200);
  });
});
