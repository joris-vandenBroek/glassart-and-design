import { describe, expect, it, beforeEach } from 'vitest';
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

beforeEach(async () => {
  await getPool().query('DELETE FROM kunstenaarAfspraken');
  await getPool().query('DELETE FROM kunstenaars');
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
    await insertRow('kunstenaars', { naam: 'Anna', verkooprecht: 'open' } as never);
    const response = await listKunstenaars(req('GET'));
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].naam).toBe('Anna');
    expect(body[0].prijsafspraken).toBeUndefined();
  });

  it('rejects creating a kunstenaar without a medewerker session', async () => {
    const response = await createKunstenaar(req('POST', { naam: 'Bram', verkooprecht: 'open' }));
    expect(response.status).toBe(401);
  });

  it('allows creating, updating and deleting a kunstenaar with a medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const createResponse = await createKunstenaar(
      req('POST', { naam: 'Chris', verkooprecht: 'open' }, cookie)
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

  it('stores and retrieves prijsafspraken only for staff, keyed by the kunstenaar id', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'Dana',
      verkooprecht: 'open',
    } as never);
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
