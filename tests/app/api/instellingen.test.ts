import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET, PATCH } from '@/app/api/instellingen/[id]/route';

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

// medewerkerCookie() uses a fixed fake userId (no real medewerker row exists for it), so
// every call leaves an orphaned `sessions` row nothing else in this file would clean up.
afterEach(async () => {
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
});

// A fixture-only id, never 'bedrijfsgegevens'/'bestelinstellingen' -- the real ids used
// by the deployed app. Scoping cleanup to this one row (instead of the previous blanket
// `DELETE FROM instellingen`) keeps this test from ever touching real staging data that
// a beheer-user or the migration script has put there.
const TEST_ID = 'test-instellingen-fixture';

beforeEach(async () => {
  await getPool().query('DELETE FROM instellingen WHERE id = ?', [TEST_ID]);
});

describe('instellingen route', () => {
  it('returns 404 when no row exists yet', async () => {
    const response = await GET(
      new Request('http://localhost/api', { headers: { cookie: await medewerkerCookie() } }),
      { params: { id: TEST_ID } }
    );
    expect(response.status).toBe(404);
  });

  it('saves and reads back the data blob via PATCH/GET', async () => {
    const patchResponse = await PATCH(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: await medewerkerCookie(),
        },
        body: JSON.stringify({ bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot' }),
      }),
      { params: { id: TEST_ID } }
    );
    expect(patchResponse.status).toBe(200);

    const getResponse = await GET(
      new Request('http://localhost/api', { headers: { cookie: await medewerkerCookie() } }),
      { params: { id: TEST_ID } }
    );
    const body = await getResponse.json();
    expect(body.bezoekadres).toBe('Den Heuvel 21, 5688 EM Oirschot');
  });

  // Alleen een korte lijst records is publiek leesbaar (de contactpagina heeft
  // `bedrijfsgegevens` nodig); al het overige vraagt een medewerkersessie.
  it('weigert een onbekend instellingen-record zonder medewerkersessie', async () => {
    const response = await GET(new Request('http://localhost/api'), { params: { id: TEST_ID } });
    expect(response.status).toBe(401);
  });

  // Bewust alleen lezen: `bedrijfsgegevens` is een écht record dat de beheerder
  // heeft ingevuld, dus deze test schrijft er niets naar en gaat er ook niet van
  // uit dat het gevuld is.
  it('laat tenaamstelling en bic weg uit een publieke lees van bedrijfsgegevens', async () => {
    const publiek = await GET(new Request('http://localhost/api'), {
      params: { id: 'bedrijfsgegevens' },
    });
    expect(publiek.status).not.toBe(401);
    if (publiek.status === 404) return;

    const body = await publiek.json();
    expect(body).not.toHaveProperty('tenaamstelling');
    expect(body).not.toHaveProperty('bic');

    const alsMedewerker = await GET(
      new Request('http://localhost/api', { headers: { cookie: await medewerkerCookie() } }),
      { params: { id: 'bedrijfsgegevens' } }
    );
    const volledig = await alsMedewerker.json();
    // De medewerkerlees is niet gefilterd; welke velden gevuld zijn hangt van de
    // echte data af, dus we controleren alleen dat er niet gefilterd wordt.
    expect(Object.keys(volledig).length).toBeGreaterThanOrEqual(Object.keys(body).length);
  });

  it('rejects a PATCH without a medewerker session', async () => {
    const response = await PATCH(
      new Request('http://localhost/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bezoekadres: 'Hack' }),
      }),
      { params: { id: TEST_ID } }
    );
    expect(response.status).toBe(401);
  });
});
