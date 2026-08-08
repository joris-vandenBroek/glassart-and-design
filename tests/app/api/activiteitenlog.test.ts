import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST, GET } from '@/app/api/activiteitenlog/route';

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

// medewerkerCookie() uses a fixed fake userId (no real medewerker row exists for it), so
// every call leaves an orphaned `sessions` row nothing else in this file would clean up.
afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
});

// This route's GET has no per-test filter (it lists the whole table, newest 500),
// and POST doesn't echo back the inserted row's id -- so instead of a table-wide
// DELETE, each test uses a distinctive omschrijving/actorEmail to find its own entry
// within whatever else (real activity or other tests) is present.
describe('activiteitenlog route', () => {
  it('inserts an entry (with omschrijving) and lists it back', async () => {
    const marker = `test-marker-${Date.now()}-${Math.random()}`;
    await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'bestelling_geplaatst',
          actorId: 'k1',
          actorEmail: 'k@x.com',
          actorNaam: 'Acme',
          omschrijving: marker,
        }),
      })
    );
    const response = await GET(
      new Request('http://localhost/api', { headers: { cookie: await medewerkerCookie() } })
    );
    const body = await response.json();
    const found = body.find((row: { omschrijving: string }) => row.omschrijving === marker);
    expect(found).toBeDefined();
    expect(found.type).toBe('bestelling_geplaatst');

    await getPool().query('DELETE FROM activiteitenlog WHERE omschrijving = ?', [marker]);
  });

  it('rejects reading the log without a medewerker session', async () => {
    const response = await GET(new Request('http://localhost/api'));
    expect(response.status).toBe(401);
  });

  it('rejects an unknown activiteit type', async () => {
    const response = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'niet_bestaand_type', actorId: null, actorEmail: 'x', actorNaam: 'x' }),
      })
    );
    expect(response.status).toBe(400);
  });

  // Deze route staat bewust open voor anonieme bezoekers. Zonder server-side
  // afleiding kon iedereen dus een gebeurtenis op naam van een medewerker
  // wegschrijven -- en daarmee het auditlog waardeloos maken.
  it('negeert een actor uit de body en logt een anonieme post als Onbekend', async () => {
    const marker = `test-marker-spoof-${Date.now()}-${Math.random()}`;
    await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'klant_goedgekeurd',
          actorId: 'staff-1',
          actorEmail: 'joris@glassartanddesign.com',
          actorNaam: 'Joris',
          omschrijving: marker,
        }),
      })
    );

    const [rows] = await getPool().query('SELECT * FROM activiteitenlog WHERE omschrijving = ?', [marker]);
    const rij = (rows as Array<{ actorId: string | null; actorEmail: string; actorNaam: string }>)[0];
    expect(rij).toBeDefined();
    expect(rij.actorId).toBeNull();
    expect(rij.actorEmail).toBe('Onbekend');
    expect(rij.actorNaam).toBe('Onbekend');

    await getPool().query('DELETE FROM activiteitenlog WHERE omschrijving = ?', [marker]);
  });

  // De sleutels van de body werden vroeger kolomnamen in de INSERT, en die
  // konden zonder sessie meegegeven worden.
  it('laat een gemanipuleerde kolomnaam in de body niet in de query landen', async () => {
    const marker = `test-marker-inject-${Date.now()}-${Math.random()}`;
    const response = await POST(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'word_klant_bezocht',
          omschrijving: marker,
          ['id`) SELECT wachtwoordHash FROM klanten -- ']: 'x',
        }),
      })
    );

    expect(response.status).toBe(201);
    const [rows] = await getPool().query('SELECT * FROM activiteitenlog WHERE omschrijving = ?', [marker]);
    expect((rows as unknown[]).length).toBe(1);

    await getPool().query('DELETE FROM activiteitenlog WHERE omschrijving = ?', [marker]);
  });
});
