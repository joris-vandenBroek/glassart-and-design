import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { POST as createKunstwerk } from '@/app/api/kunstwerken/route';
import { PATCH as patchKunstwerk, DELETE as deleteKunstwerk } from '@/app/api/kunstwerken/[id]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

const createdKunstwerkIds: string[] = [];

afterEach(async () => {
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
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

async function maakKunstwerk(code: string): Promise<string> {
  const kunstwerk = await insertRow<{ id: string }>('kunstwerken', { code } as never);
  createdKunstwerkIds.push(kunstwerk.id);
  return kunstwerk.id;
}

describe('kunstwerken.code', () => {
  it('slaat een kunstwerk op met een code in plaats van een naam', async () => {
    const id = await maakKunstwerk('test-code-basis');
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-code-basis');
  });

  it('weigert een tweede kunstwerk met dezelfde code, ook met andere hoofdletters', async () => {
    await maakKunstwerk('test-code-dubbel');
    // insertRow gooit de ruwe mysql2-fout door; ER_DUP_ENTRY is wat de UNIQUE-index geeft.
    await expect(maakKunstwerk('TEST-CODE-DUBBEL')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
});

describe('POST /api/kunstwerken', () => {
  it('weigert een lege code met 400', async () => {
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: '   ', omschrijvingNl: 'x' }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code-verplicht' });
  });

  it('weigert een code die al bestaat, ook met andere hoofdletters, met 409', async () => {
    await maakKunstwerk('test-post-dubbel');
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: 'TEST-POST-DUBBEL' }, cookie));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });
  });

  it('maakt een kunstwerk aan met een vrije code en trimt de code', async () => {
    const cookie = await medewerkerCookie();
    const response = await createKunstwerk(postRequest({ code: '  test-post-vrij  ' }, cookie));
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    createdKunstwerkIds.push(created.id);
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [created.id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-post-vrij');
  });

  it('weigert zonder medewerkersessie met 401', async () => {
    const response = await createKunstwerk(
      new Request('http://localhost/api/kunstwerken', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'test-post-geen-sessie' }),
      })
    );
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/kunstwerken/[id]', () => {
  it('weigert een code die al bij een ander kunstwerk hoort met 409', async () => {
    await maakKunstwerk('test-patch-bezet');
    const id = await maakKunstwerk('test-patch-eigen');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-bezet' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'code-bestaat-al' });
  });

  it('weigert een lege code met 400', async () => {
    const id = await maakKunstwerk('test-patch-leeg');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: '  ' }, cookie), { params: { id } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code-verplicht' });
  });

  it('wijzigt de code van een kunstwerk dat niet besteld is', async () => {
    const id = await maakKunstwerk('test-patch-oud');
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-nieuw' }, cookie), {
      params: { id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT code FROM kunstwerken WHERE id = ?', [id]);
    expect((rows as Array<{ code: string }>)[0].code).toBe('test-patch-nieuw');
  });

  it('geeft 404 voor een kunstwerk dat niet bestaat', async () => {
    const cookie = await medewerkerCookie();
    const response = await patchKunstwerk(patchRequest({ code: 'test-patch-onbekend' }, cookie), {
      params: { id: 'bestaat-niet' },
    });
    expect(response.status).toBe(404);
  });
});
