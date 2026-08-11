import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listZendingen, POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

describe('drukkerZendingen route', () => {
  const createdDrukkerIds: string[] = [];
  const createdKlantEmails: string[] = [];
  let teller = 0;

  afterEach(async () => {
    const pool = getPool();
    // drukkerZendingen -> drukkers is sinds het drukkernummer-ontwerp RESTRICT, geen
    // cascade meer -- eerst de koppelrijen en de zending zelf weg, dan pas de drukker.
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
    const email = `autotest-dz-${nr}-${randomUUID()}@example.com`;
    const klantnr = `AT-K-DZ-${nr}`;
    await insertRow<{ id: string }>('klanten', {
      email,
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
      klantnr,
    } as never);
    createdKlantEmails.push(email);
    const bestelnr = `AT-BE-DZ-${nr}`;
    await getPool().query('INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      klantnr,
      bestelnr,
      'Te beoordelen',
    ]);
    return bestelnr;
  }

  it('rejects listing without a medewerker session', async () => {
    const drukker = await insertRow<{ id: string; drukkernr: string }>('drukkers', {
      naam: 'PrintCo',
      drukkernr: `AT-D-DZ-${++teller}`,
    } as never);
    createdDrukkerIds.push(drukker.id);
    const response = await listZendingen(new Request('http://localhost/api'), {
      params: { id: drukker.id },
    });
    expect(response.status).toBe(401);
  });

  it('creates and lists a zending for a medewerker, newest first', async () => {
    const drukker = await insertRow<{ id: string; drukkernr: string }>('drukkers', {
      naam: 'PrintCo',
      drukkernr: `AT-D-DZ-${++teller}`,
    } as never);
    createdDrukkerIds.push(drukker.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const bestelnr1 = await maakBestelnr();
    const bestelnr2 = await maakBestelnr();

    await createZending(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          onderwerp: 'Bestellingen week 30',
          body: 'Zie bijlage',
          bestellingIds: [bestelnr1, bestelnr2],
          aantalKlanten: 2,
          aantalRegels: 3,
          verzondDoor: 'Paul',
          zendingnummer: `AT-ZD-DZ-${++teller}`,
        }),
      }),
      { params: { id: drukker.id } }
    );

    const response = await listZendingen(
      new Request('http://localhost/api', { headers: { cookie } }),
      { params: { id: drukker.id } }
    );
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].onderwerp).toBe('Bestellingen week 30');
    expect(body[0].bestellingIds.sort()).toEqual([bestelnr1, bestelnr2].sort());
  });
});
