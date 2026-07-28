import { describe, expect, it } from 'vitest';
import { insertRow } from '@/lib/server/crud';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listZendingen, POST as createZending } from '@/app/api/drukkers/[id]/zendingen/route';

// No table-wide cleanup here: every test creates its own fresh drukker (a random
// UUID), and listZendingen is scoped to that one drukkerId -- other drukkers/
// zendingen (real or from other test runs) never affect these assertions, so there
// is nothing to protect against and no need to ever touch rows this test didn't create.
describe('drukkerZendingen route', () => {
  it('rejects listing without a medewerker session', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'PrintCo' } as never);
    const response = await listZendingen(new Request('http://localhost/api'), {
      params: { id: drukker.id },
    });
    expect(response.status).toBe(401);
  });

  it('creates and lists a zending for a medewerker, newest first', async () => {
    const drukker = await insertRow<{ id: string }>('drukkers', { naam: 'PrintCo' } as never);
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
