import { afterEach, describe, expect, it } from 'vitest';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as lookupZendingen } from '@/app/api/drukkerzendingen/route';
import { POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

// Elke test maakt zijn eigen drukker met een verse UUID; de bestellingIds zijn
// `autotest-`-gemarkeerde literals die nergens anders voorkomen, zodat de lookup
// nooit echte zendingen uit staging raakt. De drukker wordt op vastgelegd id
// verwijderd (cascade ruimt de zendingen mee op) -- nooit een ongefilterde DELETE.
describe('drukkerzendingen lookup route', () => {
  const createdDrukkerIds: string[] = [];

  afterEach(async () => {
    while (createdDrukkerIds.length > 0) {
      await deleteRow('drukkers', createdDrukkerIds.pop()!);
    }
    await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  async function maakZending(bestellingIds: string[], cookie: string) {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'AUTOTEST PrintCo' } as never);
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
        }),
      }),
      { params: { id: drukker.id } }
    );
    return drukker;
  }

  it('rejects the lookup without a medewerker session', async () => {
    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=autotest-1')
    );
    expect(response.status).toBe(401);
  });

  it('finds the zending that contains the requested bestelling, including the drukker name', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const drukker = await maakZending(['autotest-a1', 'autotest-a2'], cookie);

    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=autotest-a1', { headers: { cookie } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].drukkerId).toBe(drukker.id);
    expect(body[0].drukkerNaam).toBe('AUTOTEST PrintCo');
    expect(body[0].bestellingIds).toEqual(['autotest-a1', 'autotest-a2']);
  });

  it('returns an empty array for an unknown bestelling id', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    await maakZending(['autotest-b1'], cookie);

    const response = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=autotest-bestaat-niet', {
        headers: { cookie },
      })
    );
    expect(await response.json()).toEqual([]);
  });

  it('returns an empty array when the bestellingIds parameter is missing or empty', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const zonder = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen', { headers: { cookie } })
    );
    expect(await zonder.json()).toEqual([]);

    const leeg = await lookupZendingen(
      new Request('http://localhost/api/drukkerzendingen?bestellingIds=', { headers: { cookie } })
    );
    expect(await leeg.json()).toEqual([]);
  });

  it('rejects more than 200 ids', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
    const ids = Array.from({ length: 201 }, (_, index) => `autotest-${index}`).join(',');

    const response = await lookupZendingen(
      new Request(`http://localhost/api/drukkerzendingen?bestellingIds=${ids}`, { headers: { cookie } })
    );
    expect(response.status).toBe(400);
  });
});
