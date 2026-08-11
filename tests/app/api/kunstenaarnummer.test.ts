import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as createKunstenaar } from '@/app/api/kunstenaars/route';
import { PATCH as patchKunstenaar, DELETE as deleteKunstenaar } from '@/app/api/kunstenaars/[id]/route';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

const createdKunstenaarIds: string[] = [];
const createdKlantEmails: string[] = [];

afterEach(async () => {
  // createSession('medewerker', 'staff-1') gebruikt een vast nep-userId (er bestaat geen
  // medewerkerrij voor), dus elke aanroep laat een losse sessions-rij achter.
  await veiligOpruimen('sessions (medewerker staff-1)', () =>
    getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'")
  );
  // De klant verwijst naar de kunstenaar, dus die moet eerst weg voordat de kunstenaar
  // zelf wordt opgeruimd.
  if (createdKlantEmails.length > 0) {
    await veiligOpruimen('klanten', () =>
      getPool().query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails])
    );
    createdKlantEmails.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await veiligOpruimen('kunstenaars', () =>
      getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds])
    );
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

function deleteRequest(cookie: string): Request {
  return new Request('http://localhost/api/kunstenaars/x', { method: 'DELETE', headers: { cookie } });
}

describe('kunstenaar verwijderen met een gekoppelde klant', () => {
  it('weigert verwijderen zolang een klant aan de kunstenaar gekoppeld is', async () => {
    const cookie = await medewerkerCookie();
    const kunstenaar = await maakViaApi('AUTOTEST Kunstenaar Met Klant', cookie);
    const email = 'autotest-kunstenaarnr-klant@example.com';
    await insertRow('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      kunstenaarnr: kunstenaar.kunstenaarnr,
    } as never);
    createdKlantEmails.push(email);

    const geweigerd = await deleteKunstenaar(deleteRequest(cookie), { params: { id: kunstenaar.id } });
    expect(geweigerd.status).toBe(409);
    expect(await geweigerd.json()).toEqual({ error: 'in-use' });

    const [rows] = await getPool().query('SELECT 1 FROM kunstenaars WHERE id = ?', [kunstenaar.id]);
    expect((rows as unknown[]).length).toBe(1);
  });

  it('staat verwijderen toe zodra de koppeling weg is', async () => {
    const cookie = await medewerkerCookie();
    const kunstenaar = await maakViaApi('AUTOTEST Kunstenaar Zonder Klant', cookie);

    const response = await deleteKunstenaar(deleteRequest(cookie), { params: { id: kunstenaar.id } });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT 1 FROM kunstenaars WHERE id = ?', [kunstenaar.id]);
    expect((rows as unknown[]).length).toBe(0);
    createdKunstenaarIds.length = 0;
  });
});
