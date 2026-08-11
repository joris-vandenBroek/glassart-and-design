import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as lookupZendingen } from '@/app/api/drukkerzendingen/route';
import { POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

describe('drukkerzendingen lookup route', () => {
  const createdDrukkerIds: string[] = [];
  const createdKlantEmails: string[] = [];
  let teller = 0;

  afterEach(async () => {
    const pool = getPool();
    if (createdDrukkerIds.length > 0) {
      await pool.query(
        `DELETE dzb FROM drukkerZendingBestellingen dzb
         JOIN drukkerZendingen z ON z.zendingnummer = dzb.zendingnummer
         JOIN drukkers d ON d.drukkernr = z.drukkernr
         WHERE d.id IN (?)`,
        [createdDrukkerIds]
      );
      await pool.query(
        'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
        [createdDrukkerIds]
      );
      while (createdDrukkerIds.length > 0) {
        await deleteRow('drukkers', createdDrukkerIds.pop()!);
      }
    }
    if (createdKlantEmails.length > 0) {
      await pool.query(
        'DELETE FROM bestelheaders WHERE klantnr IN (SELECT klantnr FROM klanten WHERE email IN (?))',
        [createdKlantEmails]
      );
      await pool.query('DELETE FROM klanten WHERE email IN (?)', [createdKlantEmails]);
      createdKlantEmails.length = 0;
    }
    await pool.query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  async function maakBestelnr(): Promise<string> {
    const nr = ++teller;
    const email = `autotest-dzl-${nr}-${randomUUID()}@example.com`;
    const klantnr = `AT-K-DZL-${nr}`;
    await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      klantnr,
    } as never);
    createdKlantEmails.push(email);
    const bestelnr = `AT-BE-DZL-${nr}`;
    await getPool().query('INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      klantnr,
      bestelnr,
      'Te beoordelen',
    ]);
    return bestelnr;
  }

  async function maakZending(bestellingIds: string[], cookie: string) {
    const drukker = await insertRow<{ id: string; drukkernr: string }>('drukkers', {
      naam: 'AUTOTEST PrintCo',
      drukkernr: `AT-D-DZL-${++teller}`,
    } as never);
    createdDrukkerIds.push(drukker.id);
    await createZending(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          onderwerp: 'AUTOTEST zending',
          body: 'AUTOTEST',
          bestellingIds,
          aantalKlanten: 1,
          aantalRegels: bestellingIds.length,
          verzondDoor: 'AUTOTEST',
          zendingnummer: `AT-ZD-DZL-${++teller}`,
        }),
      }),
      { params: { id: drukker.id } }
    );
    return drukker;
  }

  it('rejects the lookup without a medewerker session', async () => {
    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=AT-BE-ONBEKEND')
    );
    expect(response.status).toBe(401);
  });

  it('finds the zending that contains the requested bestelling, including the drukker name', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const bestelnrA1 = await maakBestelnr();
    const bestelnrA2 = await maakBestelnr();
    const drukker = await maakZending([bestelnrA1, bestelnrA2], cookie);

    const response = await lookupZendingen(
      new Request(`http://localhost/api/drukkerzendingen?bestellingIds=${bestelnrA1}`, { headers: { cookie } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].drukkernr).toBe(drukker.drukkernr);
    expect(body[0].drukkerNaam).toBe('AUTOTEST PrintCo');
    expect(body[0].bestellingIds.sort()).toEqual([bestelnrA1, bestelnrA2].sort());
  });

  it('returns an empty array for an unknown bestelling id', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const bestelnrB1 = await maakBestelnr();
    await maakZending([bestelnrB1], cookie);

    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=AT-BE-BESTAAT-NIET', { headers: { cookie } })
    );
    expect(await response.json()).toEqual([]);
  });

  it('returns an empty array when the bestellingIds parameter is missing or empty', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const zonder = await lookupZendingen(new Request('http://localhost/api/drukkerzendingen', { headers: { cookie } }));
    expect(await zonder.json()).toEqual([]);

    const leeg = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=', { headers: { cookie } })
    );
    expect(await leeg.json()).toEqual([]);
  });

  it('rejects more than 200 ids', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const ids = Array.from({ length: 201 }, (_, index) => `AT-BE-${index}`).join(',');

    const response = await lookupZendingen(
      new Request(`http://localhost/api/drukkerzendingen?bestellingIds=${ids}`, { headers: { cookie } })
    );
    expect(response.status).toBe(400);
  });
});
