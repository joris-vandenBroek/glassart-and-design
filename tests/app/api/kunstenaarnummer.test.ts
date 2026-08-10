import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createKunstenaar } from '@/app/api/kunstenaars/route';
import { PATCH as patchKunstenaar } from '@/app/api/kunstenaars/[id]/route';

const createdKunstenaarIds: string[] = [];

afterEach(async () => {
  // createSession('medewerker', 'staff-1') gebruikt een vast nep-userId (er bestaat geen
  // medewerkerrij voor), dus elke aanroep laat een losse sessions-rij achter.
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
});

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

function postRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstenaars', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown, cookie: string): Request {
  return new Request('http://localhost/api/kunstenaars/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

async function maakViaApi(naam: string, cookie: string, extra: Record<string, unknown> = {}) {
  const response = await createKunstenaar(postRequest({ naam, exclusieveKlantIds: [], ...extra }, cookie));
  expect(response.status).toBe(201);
  const created = (await response.json()) as { id: string; kunstenaarnr: string };
  createdKunstenaarIds.push(created.id);
  return created;
}

describe('kunstenaarnr', () => {
  it('kent bij het aanmaken een oplopend KU-nummer toe', async () => {
    const cookie = await medewerkerCookie();
    const eerste = await maakViaApi('AUTOTEST Nummer Een', cookie);
    const tweede = await maakViaApi('AUTOTEST Nummer Twee', cookie);

    expect(eerste.kunstenaarnr).toMatch(/^KU-\d{5}$/);
    expect(tweede.kunstenaarnr).toMatch(/^KU-\d{5}$/);
    // Relatief aan de tellerstand: de counters-rij mag nooit gereset worden.
    expect(Number(tweede.kunstenaarnr.slice(3))).toBe(Number(eerste.kunstenaarnr.slice(3)) + 1);
  });

  it('slaat het nummer ook echt op in de database', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Nummer Opgeslagen', cookie);
    const [rows] = await getPool().query('SELECT kunstenaarnr FROM kunstenaars WHERE id = ?', [created.id]);
    expect((rows as Array<{ kunstenaarnr: string }>)[0].kunstenaarnr).toBe(created.kunstenaarnr);
  });

  it('negeert een kunstenaarnr uit de request-body bij het aanmaken', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Nummer Verzonnen', cookie, { kunstenaarnr: 'KU-99999' });
    expect(created.kunstenaarnr).not.toBe('KU-99999');
  });

  it('negeert een kunstenaarnr uit de request-body bij het wijzigen', async () => {
    const cookie = await medewerkerCookie();
    const created = await maakViaApi('AUTOTEST Nummer Vast', cookie);

    const response = await patchKunstenaar(patchRequest({ kunstenaarnr: 'KU-99998', naam: 'AUTOTEST Nummer Vast 2' }, cookie), {
      params: { id: created.id },
    });
    expect(response.status).toBe(200);

    const [rows] = await getPool().query('SELECT kunstenaarnr, naam FROM kunstenaars WHERE id = ?', [created.id]);
    const rij = (rows as Array<{ kunstenaarnr: string; naam: string }>)[0];
    expect(rij.kunstenaarnr).toBe(created.kunstenaarnr);
    expect(rij.naam).toBe('AUTOTEST Nummer Vast 2');
  });
});
