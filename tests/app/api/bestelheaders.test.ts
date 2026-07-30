import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createHeader, GET as listHeaders } from '@/app/api/bestelheaders/route';
import { PATCH as patchHeader } from '@/app/api/bestelheaders/[id]/route';
import { PATCH as patchLine } from '@/app/api/bestelheaders/[id]/bestellines/[lineId]/route';

const BESTELNR_PADDING = 5;

// Tracks the exact ids/emails each test creates and removes only those afterward --
// never a table-wide DELETE, and never resets the real counters.bestelnummer sequence
// (a real customer's next order continues from wherever it was, uninterrupted by a
// test run -- resetting it to 0 would risk a real order colliding with a bestelnr
// already issued before the tests ran). "Incrementing bestelnr" tests instead read
// the counter's current value first and assert relative to that.
const createdKlantEmails: string[] = [];
const createdKunstwerkIds: string[] = [];
const createdKunstenaarIds: string[] = [];

afterEach(async () => {
  if (createdKlantEmails.length > 0) {
    await getPool().query(
      'DELETE FROM sessions WHERE userType = \'klant\' AND userId IN (SELECT id FROM klanten WHERE email IN (?))',
      [createdKlantEmails]
    );
    await getPool().query('DELETE FROM bestelheaders WHERE klantId IN (SELECT id FROM klanten WHERE email IN (?))', [
      createdKlantEmails,
    ]);
    await getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
    createdKlantEmails.length = 0;
  }
  if (createdKunstwerkIds.length > 0) {
    await getPool().query('DELETE FROM kunstwerken WHERE id IN (?)', [createdKunstwerkIds]);
    createdKunstwerkIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
});

async function nextExpectedBestelnr(): Promise<string> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'bestelnummer'", []);
  const current = ((rows as Array<{ value: number }>)[0]?.value ?? 0) + 1;
  return `GD-${String(current).padStart(BESTELNR_PADDING, '0')}`;
}

async function klant(email: string): Promise<{ id: string; cookie: string }> {
  const created = await insertRow<{ id: string }>('klanten', {
    email,
    wachtwoordHash: await hashPassword('x'),
    status: 'Goedgekeurd',
  } as never);
  createdKlantEmails.push(email);
  const sessionId = await createSession('klant', created.id);
  return { id: created.id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function postRequest(body: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe('bestelheaders routes', () => {
  it('creates a header with lines and an incrementing bestelnr, using the session klant', async () => {
    const { id: klantId, cookie } = await klant('k@example.com');
    const expectedBestelnr = await nextExpectedBestelnr();

    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }] },
        cookie
      )
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.bestelnr).toBe(expectedBestelnr);

    const [headerRows] = await getPool().query('SELECT klantId FROM bestelheaders WHERE id = ?', [body.id]);
    expect((headerRows as Array<{ klantId: string }>)[0].klantId).toBe(klantId);

    const [lineRows] = await getPool().query(
      'SELECT * FROM bestellines WHERE bestelheaderId = ?',
      [body.id]
    );
    expect((lineRows as unknown[]).length).toBe(1);
  });

  it('rejects placing an order without a klant session', async () => {
    const response = await createHeader(postRequest({ lines: [] }));
    expect(response.status).toBe(401);
  });

  it('ignores a klantId in the request body -- the order is always placed for the session klant', async () => {
    const { id: klantId, cookie } = await klant('spoof@example.com');
    const other = await klant('spoof-target@example.com');

    const response = await createHeader(
      postRequest({ klantId: other.id, lines: [] }, cookie)
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const [rows] = await getPool().query('SELECT klantId FROM bestelheaders WHERE id = ?', [body.id]);
    expect((rows as Array<{ klantId: string }>)[0].klantId).toBe(klantId);
  });

  it('lists all headers for a medewerker, and only own headers for a customer', async () => {
    const klantA = await klant('a@example.com');
    const klantB = await klant('b@example.com');
    const headerA = await (await createHeader(postRequest({ lines: [] }, klantA.cookie))).json();
    const headerB = await (await createHeader(postRequest({ lines: [] }, klantB.cookie))).json();

    const all = await listHeaders(
      new Request('http://localhost/api/bestelheaders', { headers: { cookie: await medewerkerCookie() } })
    );
    const allIds = (await all.json()).map((row: { id: string }) => row.id);
    expect(allIds).toEqual(expect.arrayContaining([headerA.id, headerB.id]));

    const onlyA = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantA.id}`, {
        headers: { cookie: klantA.cookie },
      })
    );
    const onlyAIds = (await onlyA.json()).map((row: { id: string }) => row.id);
    expect(onlyAIds).toEqual([headerA.id]);
  });

  it('rejects listing all headers without a medewerker session', async () => {
    const response = await listHeaders(new Request('http://localhost/api/bestelheaders'));
    expect(response.status).toBe(401);
  });

  it('rejects a klant reading another klant\'s orders by klantId', async () => {
    const klantA = await klant('reader-a@example.com');
    const klantB = await klant('reader-b@example.com');
    const response = await listHeaders(
      new Request(`http://localhost/api/bestelheaders?klantId=${klantB.id}`, {
        headers: { cookie: klantA.cookie },
      })
    );
    expect(response.status).toBe(401);
  });

  it('updates header status and a line price as a medewerker', async () => {
    const { cookie } = await klant('c@example.com');
    const created = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: null, quantity: 1 }] },
        cookie
      )
    );
    const header = await created.json();
    const [lineRows] = await getPool().query('SELECT id FROM bestellines WHERE bestelheaderId = ?', [
      header.id,
    ]);
    const lineId = (lineRows as Array<{ id: string }>)[0].id;
    const staffCookie = await medewerkerCookie();

    await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    await patchLine(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ prijs: 199 }),
      }),
      { params: { id: header.id, lineId } }
    );

    const [headerRows] = await getPool().query('SELECT status FROM bestelheaders WHERE id = ?', [
      header.id,
    ]);
    expect((headerRows as Array<{ status: string }>)[0].status).toBe('Te versturen naar drukker');
    const [updatedLineRows] = await getPool().query('SELECT prijs FROM bestellines WHERE id = ?', [
      lineId,
    ]);
    expect(Number((updatedLineRows as Array<{ prijs: string }>)[0].prijs)).toBe(199);
  });

  it('rejects patching a header status or line price without a medewerker session', async () => {
    const { cookie } = await klant('unauth-patch@example.com');
    const created = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: null, quantity: 1 }] },
        cookie
      )
    );
    const header = await created.json();
    const [lineRows] = await getPool().query('SELECT id FROM bestellines WHERE bestelheaderId = ?', [
      header.id,
    ]);
    const lineId = (lineRows as Array<{ id: string }>)[0].id;

    const headerResponse = await patchHeader(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      }),
      { params: { id: header.id } }
    );
    expect(headerResponse.status).toBe(401);

    const lineResponse = await patchLine(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prijs: 1 }),
      }),
      { params: { id: header.id, lineId } }
    );
    expect(lineResponse.status).toBe(401);
  });

  it('rejects a line with a non-positive quantity', async () => {
    const { cookie } = await klant('e@example.com');
    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 0 }] },
        cookie
      )
    );
    expect(response.status).toBe(400);
  });

  it('rejects a line with a non-positive prijs', async () => {
    const { cookie } = await klant('f@example.com');
    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: -5, quantity: 1 }] },
        cookie
      )
    );
    expect(response.status).toBe(400);
  });

  it('rejects ordering an artwork exclusively reserved for a different klant, allows the listed klant', async () => {
    const klantA = await klant('g@example.com');
    const klantB = await klant('h@example.com');
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Exclusieve Artiest', exclusieveKlantIds: [klantB.id] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk',
      kunstenaarId: kunstenaar.id,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const response = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }] },
        klantA.cookie
      )
    );
    expect(response.status).toBe(403);

    const allowedForB = await createHeader(
      postRequest(
        { lines: [{ kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 }] },
        klantB.cookie
      )
    );
    expect(allowedForB.status).toBe(201);
  });

  it('rejects ordering an artwork exclusive to 2 klanten from a third klant, allows both listed klanten', async () => {
    const klantA = await klant('exclusief-a@example.com');
    const klantB = await klant('exclusief-b@example.com');
    const klantC = await klant('exclusief-c@example.com');
    const kunstenaar = await insertRow<{ id: string }>(
      'kunstenaars',
      { naam: 'Twee-klanten Artiest', exclusieveKlantIds: [klantA.id, klantB.id] } as never,
      ['exclusieveKlantIds']
    );
    createdKunstenaarIds.push(kunstenaar.id);
    const kunstwerk = await insertRow<{ id: string }>('kunstwerken', {
      naam: 'Werk 2',
      kunstenaarId: kunstenaar.id,
    } as never);
    createdKunstwerkIds.push(kunstwerk.id);

    const line = { kunstwerkId: kunstwerk.id, maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 1 };
    expect((await createHeader(postRequest({ lines: [line] }, klantA.cookie))).status).toBe(201);
    expect((await createHeader(postRequest({ lines: [line] }, klantB.cookie))).status).toBe(201);
    expect((await createHeader(postRequest({ lines: [line] }, klantC.cookie))).status).toBe(403);
  });
});
