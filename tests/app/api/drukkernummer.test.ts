import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createDrukker } from '@/app/api/drukkers/route';
import { PATCH as patchDrukker } from '@/app/api/drukkers/[id]/route';
import { POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

const createdDrukkerIds: string[] = [];

afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  if (createdDrukkerIds.length > 0) {
    // Zendingen verwijzen naar de drukker en cascaderen niet meer; eerst die weg.
    await getPool().query(
      'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
      [createdDrukkerIds]
    );
    await getPool().query('DELETE FROM drukkers WHERE id IN (?)', [createdDrukkerIds]);
    createdDrukkerIds.length = 0;
  }
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function jsonRequest(method: string, body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/drukkers', {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

async function maakViaApi(naam: string, cookie: string, extra: Record<string, unknown> = {}) {
  const response = await createDrukker(jsonRequest('POST', { naam, email: 'autotest@example.com', ...extra }, cookie));
  expect(response.status).toBe(201);
  const created = (await response.json()) as { id: string; drukkernr: string };
  createdDrukkerIds.push(created.id);
  return created;
}

describe('drukkernr', () => {
  it('kent bij het aanmaken een oplopend DR-nummer toe', async () => {
    const cookie = await medewerkerCookie();
    const eerste = await maakViaApi('AUTOTEST Drukker Een', cookie);
    const tweede = await maakViaApi('AUTOTEST Drukker Twee', cookie);

    expect(eerste.drukkernr).toMatch(/^DR-\d{5}$/);
    expect(Number(tweede.drukkernr.slice(3))).toBe(Number(eerste.drukkernr.slice(3)) + 1);
  });

  it('negeert een drukkernr uit de request-body', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Drukker Verzonnen', cookie, { drukkernr: 'DR-99999' });
    expect(created.drukkernr).not.toBe('DR-99999');

    const response = await patchDrukker(jsonRequest('PATCH', { drukkernr: 'DR-99998' }, cookie), {
      params: { id: created.id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT drukkernr FROM drukkers WHERE id = ?', [created.id]);
    expect((rows as Array<{ drukkernr: string }>)[0].drukkernr).toBe(created.drukkernr);
  });

  it('slaat een zending op met het drukkernr van de drukker', async () => {
    const cookie = await medewerkerCookie();
    const drukker = await maakViaApi('AUTOTEST Drukker Zending', cookie);

    const response = await createZending(
      jsonRequest('POST', { onderwerp: 'AUTOTEST', body: 'x', bestellingIds: [], aantalKlanten: 1, aantalRegels: 1 }, cookie),
      { params: { id: drukker.id } }
    );
    expect(response.status).toBe(201);
    const zending = (await response.json()) as { id: string; drukkernr: string };
    expect(zending.drukkernr).toBe(drukker.drukkernr);
  });

  it('geeft 404 als er een zending voor een onbekende drukker gepost wordt', async () => {
    const cookie = await medewerkerCookie();
    const response = await createZending(
      jsonRequest('POST', { onderwerp: 'AUTOTEST', body: 'x', bestellingIds: [] }, cookie),
      { params: { id: 'bestaat-niet' } }
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'drukker-not-found' });
  });
});
