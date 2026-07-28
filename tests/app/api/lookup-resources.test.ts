import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listResource, POST as createResource } from '@/app/api/[resource]/route';
import {
  GET as getResource,
  PATCH as patchResource,
  DELETE as deleteResource,
} from '@/app/api/[resource]/[id]/route';

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

function jsonRequest(method: string, body?: unknown) {
  return new Request('http://localhost/api/segmenten', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('generic lookup-resource routes', () => {
  it('creates then lists a segment', async () => {
    const createResponse = await createResource(jsonRequest('POST', { omschrijving: 'Hotel' }), {
      params: { resource: 'segmenten' },
    });
    const created = await createResponse.json();
    createdSegmentIds.push(created.id);

    const response = await listResource(jsonRequest('GET'), { params: { resource: 'segmenten' } });
    const body = await response.json();
    const found = body.find((row: { id: string }) => row.id === created.id);
    expect(found.omschrijving).toBe('Hotel');
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
    const createResponse = await createResource(jsonRequest('POST', { omschrijving: 'Restaurant' }), {
      params: { resource: 'segmenten' },
    });
    const created = await createResponse.json();

    const getResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await getResponse.json()).omschrijving).toBe('Restaurant');

    await patchResource(jsonRequest('PATCH', { omschrijving: 'Restaurantpand' }), {
      params: { resource: 'segmenten', id: created.id },
    });
    const updatedResponse = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect((await updatedResponse.json()).omschrijving).toBe('Restaurantpand');

    await deleteResource(jsonRequest('DELETE'), {
      params: { resource: 'segmenten', id: created.id },
    });
    const afterDelete = await getResource(jsonRequest('GET'), {
      params: { resource: 'segmenten', id: created.id },
    });
    expect(afterDelete.status).toBe(404);
  });
});
