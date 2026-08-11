import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as getMe, PATCH as patchMe } from '@/app/api/klanten/me/route';
import { veiligOpruimen } from '../../helpers/veiligOpruimen';

// Every klant this suite creates uses a @example.com address, so cleanup is scoped
// to exactly those ids -- never a table-wide DELETE -- and is safe to run against a
// klanten table that already holds real customer registrations.
const createdKlantIds: string[] = [];

afterEach(async () => {
  if (createdKlantIds.length > 0) {
    await veiligOpruimen('sessions (klant)', () =>
      getPool().query('DELETE FROM sessions WHERE userId IN (?)', [createdKlantIds])
    );
    await veiligOpruimen('klanten', () =>
      getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds])
    );
    createdKlantIds.length = 0;
  }
});

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function createKlantWithCookie(overrides: Record<string, unknown> = {}) {
  const klant = await insertRow<{ id: string }>('klanten', {
    email: `me-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    wachtwoordHash: await hashPassword('geheim123'),
    companyName: 'Acme BV',
    status: 'Beoordelen',
    ...overrides,
  } as never);
  createdKlantIds.push(klant.id);
  const sessionId = await createSession('klant', klant.id);
  return { klant, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

describe('klanten self-service route', () => {
  it('rejects GET and PATCH without a klant session', async () => {
    expect((await getMe(req('GET'))).status).toBe(401);
    expect((await patchMe(req('PATCH', { companyName: 'X' }))).status).toBe(401);
  });

  it('returns the caller\'s own klant record without the wachtwoordHash', async () => {
    const { cookie } = await createKlantWithCookie({ companyName: 'Zilveren Zwaan' });
    const response = await getMe(req('GET', undefined, cookie));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.companyName).toBe('Zilveren Zwaan');
    expect(body.wachtwoordHash).toBeUndefined();
  });

  it('updates only the allowed self-service fields', async () => {
    const { klant, cookie } = await createKlantWithCookie();
    const response = await patchMe(
      req('PATCH', { companyName: 'Nieuwe Naam', phone: '0611223344' }, cookie)
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT companyName, phone FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    const row = (rows as Array<{ companyName: string; phone: string }>)[0];
    expect(row.companyName).toBe('Nieuwe Naam');
    expect(row.phone).toBe('0611223344');
  });

  it('ignores staff-only fields sent in the request body (no privilege escalation)', async () => {
    const { klant, cookie } = await createKlantWithCookie({ status: 'Beoordelen' });
    await patchMe(
      req(
        'PATCH',
        {
          companyName: 'Escalatiepoging BV',
          status: 'Goedgekeurd',
          prijsgroepId: 'pg-1',
          kunstenaarnr: 'KU-99999',
          minimaleAfname: 1,
        },
        cookie
      )
    );
    const [rows] = await getPool().query(
      'SELECT companyName, status, prijsgroepId, minimaleAfname FROM klanten WHERE id = ?',
      [klant.id]
    );
    const row = (rows as Array<{
      companyName: string;
      status: string;
      prijsgroepId: string | null;
      minimaleAfname: number | null;
    }>)[0];
    expect(row.companyName).toBe('Escalatiepoging BV');
    expect(row.status).toBe('Beoordelen');
    expect(row.prijsgroepId).toBeNull();
    expect(row.minimaleAfname).toBeNull();
  });

  it('changes the password when one is provided, hashed server-side', async () => {
    const { klant, cookie } = await createKlantWithCookie();
    const response = await patchMe(req('PATCH', { password: 'nieuwGeheim123' }, cookie));
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    const stored = (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash;
    expect(await verifyPassword('nieuwGeheim123', stored)).toBe(true);
    expect(await verifyPassword('geheim123', stored)).toBe(false);
  });

  it('rejects a password shorter than 8 characters and leaves the old one intact', async () => {
    const { klant, cookie } = await createKlantWithCookie();
    const response = await patchMe(req('PATCH', { password: 'kort' }, cookie));
    expect(response.status).toBe(400);
    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    const stored = (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash;
    expect(await verifyPassword('geheim123', stored)).toBe(true);
  });

  it('cannot read or edit another klant\'s record', async () => {
    const { cookie } = await createKlantWithCookie({ companyName: 'Klant A' });
    const { klant: other } = await createKlantWithCookie({ companyName: 'Klant B' });

    const getResponse = await getMe(req('GET', undefined, cookie));
    const body = await getResponse.json();
    expect(body.id).not.toBe(other.id);

    await patchMe(req('PATCH', { companyName: 'Gehackt' }, cookie));
    const [rows] = await getPool().query('SELECT companyName FROM klanten WHERE id = ?', [
      other.id,
    ]);
    expect((rows as Array<{ companyName: string }>)[0].companyName).toBe('Klant B');
  });

  it('updates land and invoiceLand via self-service PATCH', async () => {
    const { klant, cookie } = await createKlantWithCookie();
    const response = await patchMe(req('PATCH', { land: 'BE', invoiceLand: 'DE' }, cookie));
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT land, invoiceLand FROM klanten WHERE id = ?', [klant.id]);
    const row = (rows as Array<{ land: string; invoiceLand: string }>)[0];
    expect(row.land).toBe('BE');
    expect(row.invoiceLand).toBe('DE');
  });

  it('accepts and stores a valid btwNummer in normalised form', async () => {
    const { klant, cookie } = await createKlantWithCookie({ land: 'BE' });
    const response = await patchMe(req('PATCH', { btwNummer: 'BE 0411.905.847' }, cookie));
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT btwNummer FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ btwNummer: string }>)[0].btwNummer).toBe('BE0411905847');
  });

  it('rejects a btwNummer that does not match the country format', async () => {
    const { cookie } = await createKlantWithCookie({ land: 'BE' });
    const response = await patchMe(req('PATCH', { btwNummer: 'NL123456789B01' }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'btwnummer-ongeldig' });
  });

  it('validates against the land in the same request when it is being changed too', async () => {
    const { cookie } = await createKlantWithCookie({ land: 'NL' });
    const response = await patchMe(
      req('PATCH', { land: 'BE', btwNummer: 'NL123456789B01' }, cookie)
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'btwnummer-ongeldig' });
  });

  it('stores an empty btwNummer as null, so an existing EU klant stays saveable', async () => {
    const { klant, cookie } = await createKlantWithCookie({
      land: 'BE',
      btwNummer: 'BE0411905847',
    });
    const response = await patchMe(req('PATCH', { btwNummer: '' }, cookie));
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT btwNummer FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ btwNummer: string | null }>)[0].btwNummer).toBeNull();
  });

  it('does not expose afwijsreden in the response, even when the klant is Afgewezen with a stored reason', async () => {
    const { cookie } = await createKlantWithCookie({ status: 'Afgewezen', afwijsreden: 'Onvoldoende gegevens.' });
    const response = await getMe(req('GET', undefined, cookie));
    // Guards against a false pass: without this, a 500 (empty error body) would also
    // satisfy the assertions below without actually proving the field is stripped.
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.afwijsreden).toBeUndefined();
    expect('afwijsreden' in body).toBe(false);
  });

  it('geeft het klantnummer terug maar laat de klant het niet zelf zetten', async () => {
    // KL-09999 valt bewust buiten de echte reeks, zodat deze fixture nooit kan
    // botsen met een nummer dat de teller uitdeelt.
    const { klant, cookie } = await createKlantWithCookie({
      status: 'Goedgekeurd',
      klantnr: 'KL-09999',
    });

    const getResponse = await getMe(req('GET', undefined, cookie));
    expect((await getResponse.json()).klantnr).toBe('KL-09999');

    await patchMe(req('PATCH', { klantnr: 'KL-00001' }, cookie));
    const [rows] = await getPool().query('SELECT klantnr FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ klantnr: string }>)[0].klantnr).toBe('KL-09999');
  });

  // De uniciteitscontrole die bij registratie wél gebeurt ontbrak hier, dus liep
  // dit op de UNIQUE-index stuk als een 500 in plaats van een uitlegbare fout.
  it('weigert een e-mailadres dat al bij een andere klant hoort', async () => {
    const { klant: bestaande } = await createKlantWithCookie();
    const { cookie } = await createKlantWithCookie();

    const [rows] = await getPool().query('SELECT email FROM klanten WHERE id = ?', [bestaande.id]);
    const bezetAdres = (rows as Array<{ email: string }>)[0].email;

    const response = await patchMe(req('PATCH', { email: bezetAdres }, cookie));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'email-in-use' });
  });

  it('weigert een onbruikbaar e-mailadres en normaliseert een geldig adres', async () => {
    const { klant, cookie } = await createKlantWithCookie();

    expect((await patchMe(req('PATCH', { email: 'geen-apenstaartje' }, cookie))).status).toBe(400);

    const nieuw = `Me-Nieuw-${Date.now()}@Example.COM`;
    expect((await patchMe(req('PATCH', { email: nieuw }, cookie))).status).toBe(200);
    const [rows] = await getPool().query('SELECT email FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ email: string }>)[0].email).toBe(nieuw.trim().toLowerCase());
  });

  // Wijzigt de klant zijn wachtwoord, dan horen andere apparaten eruit te vliegen
  // -- maar niet het apparaat waarop hij de wijziging doet.
  it('gooit andere sessies weg bij een wachtwoordwijziging, maar niet de huidige', async () => {
    const { klant, cookie } = await createKlantWithCookie();
    const andereSessie = await createSession('klant', klant.id);

    const response = await patchMe(req('PATCH', { password: 'nieuwwachtwoord' }, cookie));
    expect(response.status).toBe(200);

    const [rows] = await getPool().query('SELECT id FROM sessions WHERE userType = ? AND userId = ?', [
      'klant',
      klant.id,
    ]);
    const overgebleven = (rows as Array<{ id: string }>).map((rij) => rij.id);
    expect(overgebleven).not.toContain(andereSessie);
    expect(overgebleven).toContain(cookie.split('=')[1]);
  });

  it('weigert een te kort nieuw wachtwoord', async () => {
    const { klant, cookie } = await createKlantWithCookie();
    const response = await patchMe(req('PATCH', { password: 'kort' }, cookie));
    expect(response.status).toBe(400);

    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [klant.id]);
    expect(
      await verifyPassword('geheim123', (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash)
    ).toBe(true);
  });
});
