import { afterEach, describe, expect, it } from 'vitest';
import { deleteRow, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listZendingen, POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

// Every test creates its own fresh drukker (a random UUID) and listZendingen is
// scoped to that one drukkerId, so other drukkers/zendingen (real or from other
// test runs) never affect these assertions -- but the drukker row this test itself
// creates must still be removed, or it leaks into the shared staging DB on every
// run. drukkerZendingen no longer cascades on delete, so the afterEach below
// removes any zendingen for these drukkers first.
describe('drukkerZendingen route', () => {
  const createdDrukkerIds: string[] = [];

  afterEach(async () => {
    if (createdDrukkerIds.length > 0) {
      // Zendingen cascaderen niet meer mee met een verwijderde drukker; eerst die weg.
      await getPool().query(
        'DELETE z FROM drukkerZendingen z JOIN drukkers d ON d.drukkernr = z.drukkernr WHERE d.id IN (?)',
        [createdDrukkerIds]
      );
    }
    while (createdDrukkerIds.length > 0) {
      await deleteRow('drukkers', createdDrukkerIds.pop()!);
    }
    // createSession('medewerker', 'staff-1') uses a fixed fake userId (no real medewerker
    // row exists for it), so every call leaves an orphaned `sessions` row.
    await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  });

  it('rejects listing without a medewerker session', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { drukkernr: 'AT-D-DZ-1', naam: 'PrintCo' } as never);
    createdDrukkerIds.push(drukker.id);
    const response = await listZendingen(new Request('http://localhost/api'), {
      params: { id: drukker.id },
    });
    expect(response.status).toBe(401);
  });

  it('creates and lists a zending for a medewerker, newest first', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { drukkernr: 'AT-D-DZ-2', naam: 'PrintCo' } as never);
    createdDrukkerIds.push(drukker.id);
    const sessionId = await createSession('medewerker', 'staff-1');
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    await createZending(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          onderwerp: 'Bestellingen week 30',
          body: 'Zie bijlage',
          bestellingIds: ['b1', 'b2'],
          aantalKlanten: 2,
          aantalRegels: 3,
          verzondDoor: 'Paul',
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
    expect(body[0].bestellingIds).toEqual(['b1', 'b2']);
  });
});
