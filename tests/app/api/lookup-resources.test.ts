import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listResource, POST as createResource } from '@/app/api/[resource]/route';
import {
  GET as getResource,
  PATCH as patchResource,
  DELETE as deleteResource,
} from '@/app/api/[resource]/[id]/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM segmenten');
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
    await createResource(jsonRequest('POST', { omschrijving: 'Hotel' }), {
      params: { resource: 'segmenten' },
    });
    const response = await listResource(jsonRequest('GET'), { params: { resource: 'segmenten' } });
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].omschrijving).toBe('Hotel');
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
    await getPool().query('DELETE FROM drukkers');
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
    await createResource(jsonRequest('POST', { omschrijving: 'Restaurant' }), {
      params: { resource: 'segmenten' },
    });
    const listResponse = await listResource(jsonRequest('GET'), { params: { resource: 'segmenten' } });
    const [created] = await listResponse.json();

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
