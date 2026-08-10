import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as listKlanten } from '@/app/api/klanten/route';
import { PATCH as patchKlant, DELETE as deleteKlant } from '@/app/api/klanten/[id]/route';

// Tracks the exact ids each test creates and removes only those afterward -- never
// a table-wide DELETE -- so this suite is safe to run against a klanten table that
// already holds real customer registrations.
const createdKlantIds: string[] = [];
// Kunstenaar-fixtures voor de kunstenaarnr-FK-tests. Opgeruimd ná de klanten die
// ernaar verwijzen (zie afterEach).
const createdKunstenaarIds: string[] = [];

afterEach(async () => {
  // medewerkerCookie() uses a fixed fake userId (no real medewerker row exists for it), so
  // every call leaves an orphaned `sessions` row the klant-scoped cleanup below never catches.
  await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId = 'staff-1'");
  if (createdKlantIds.length > 0) {
    await getPool().query("DELETE FROM sessions WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds]);
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
    createdKlantIds.length = 0;
  }
  if (createdKunstenaarIds.length > 0) {
    await getPool().query('DELETE FROM kunstenaars WHERE id IN (?)', [createdKunstenaarIds]);
    createdKunstenaarIds.length = 0;
  }
});

function req(method: string, body?: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
}

// De klantnummer-teller wordt bewust nooit gereset (projectregel), dus verwachte
// nummers worden berekend ten opzichte van de actuele stand.
async function klantnummerStand(): Promise<number> {
  const [rows] = await getPool().query("SELECT value FROM counters WHERE id = 'klantnummer'");
  return (rows as Array<{ value: number }>)[0].value;
}

function verwachtKlantnr(stand: number): string {
  return `KL-${String(stand).padStart(5, '0')}`;
}

describe('klanten admin routes', () => {
  it('lists klanten', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'a@example.com',
      wachtwoordHash: await hashPassword('x'),
      companyName: 'Acme',
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);
    const response = await listKlanten(req('GET', undefined, await medewerkerCookie()));
    const body = await response.json();
    const found = body.find((row: { id: string }) => row.id === klant.id);
    expect(found.companyName).toBe('Acme');
  });

  it('rejects listing klanten without a medewerker session', async () => {
    const response = await listKlanten(req('GET'));
    expect(response.status).toBe(401);
  });

  it('approves a klant with a prijsgroep', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'b@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);
    const response = await patchKlant(
      req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, await medewerkerCookie()),
      { params: { id: klant.id } }
    );
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT status, prijsgroepId FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    expect((rows as Array<{ status: string }>)[0].status).toBe('Goedgekeurd');
  });

  it('rejects a PATCH without a medewerker session', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'e@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);
    const response = await patchKlant(req('PATCH', { status: 'Goedgekeurd' }), {
      params: { id: klant.id },
    });
    expect(response.status).toBe(401);
    const [rows] = await getPool().query('SELECT status FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ status: string }>)[0].status).toBe('Beoordelen');
  });

  it('deletes a klant as a medewerker', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'c@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const response = await deleteKlant(req('DELETE', undefined, await medewerkerCookie()), {
      params: { id: klant.id },
    });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('allows a klant to delete their own account, but not someone else\'s', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'f@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klant.id);
    const other = await insertRow<{ id: string }>('klanten', {
      email: 'g@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(other.id);
    const sessionId = await createSession('klant', klant.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const forbidden = await deleteKlant(req('DELETE', undefined, cookie), {
      params: { id: other.id },
    });
    expect(forbidden.status).toBe(401);

    const allowed = await deleteKlant(req('DELETE', undefined, cookie), {
      params: { id: klant.id },
    });
    expect(allowed.status).toBe(200);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('blocks a klant from deleting their own account while they have any bestelheaders row, open or closed', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'k@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klant.id);
    const headerId = randomUUID();
    await getPool().query('INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)', [
      headerId,
      klant.id,
      'AUTOTEST-BLOCK-1',
      'Betaald en afgerond',
    ]);
    const sessionId = await createSession('klant', klant.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    try {
      const response = await deleteKlant(req('DELETE', undefined, cookie), { params: { id: klant.id } });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe('heeft-bestellingen');
      const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
      expect((rows as unknown[]).length).toBe(1);
    } finally {
      await getPool().query('DELETE FROM bestelheaders WHERE id = ?', [headerId]);
    }
  });

  it('allows a klant to delete their own account when they have no bestelheaders rows at all', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'l@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klant.id);
    const sessionId = await createSession('klant', klant.id);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;

    const response = await deleteKlant(req('DELETE', undefined, cookie), { params: { id: klant.id } });
    expect(response.status).toBe(200);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('lets a medewerker delete a klant that has a bestelheaders row (staff branch is unaffected by the klant-side block)', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'm@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    const headerId = randomUUID();
    await getPool().query('INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)', [
      headerId,
      klant.id,
      'AUTOTEST-BLOCK-2',
      'Betaald en afgerond',
    ]);

    try {
      // Confirmed pre-existing, unrelated bug (tracked separately, not fixed by this plan):
      // deleting a klant with any bestelheaders row currently throws ER_ROW_IS_REFERENCED_2
      // regardless of who deletes them, because bestelheaders.klantId has no ON DELETE
      // CASCADE. This test documents that the staff branch is reached (not blocked by this
      // plan's new klant-side check) -- it still fails at the DB level for a different,
      // pre-existing reason, which is why this test expects a 500, not 200.
      const response = await deleteKlant(req('DELETE', undefined, await medewerkerCookie()), {
        params: { id: klant.id },
      });
      expect(response.status).toBe(500);
      const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
      expect((rows as unknown[]).length).toBe(1);
    } finally {
      await getPool().query('DELETE FROM bestelheaders WHERE id = ?', [headerId]);
      await getPool().query('DELETE FROM klanten WHERE id = ?', [klant.id]);
    }
  });

  it('rejects a DELETE without any session', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'h@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klant.id);
    const response = await deleteKlant(req('DELETE'), { params: { id: klant.id } });
    expect(response.status).toBe(401);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(1);
  });

  it('round-trips kunstenaarnr as a plain scalar', async () => {
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'AUTOTEST Klanten FK',
      kunstenaarnr: 'AT-K-KL-1',
      exclusieveKlantIds: [],
    } as never, ['exclusieveKlantIds']);
    createdKunstenaarIds.push(kunstenaar.id);
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'd@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klant.id);
    await patchKlant(req('PATCH', { kunstenaarnr: 'AT-K-KL-1' }, await medewerkerCookie()), {
      params: { id: klant.id },
    });
    const response = await listKlanten(req('GET', undefined, await medewerkerCookie()));
    const body = await response.json();
    const updated = body.find((row: { id: string }) => row.id === klant.id);
    expect(updated.kunstenaarnr).toBe('AT-K-KL-1');
  });

  it('rejects linking a second klant to a kunstenaarnr already claimed by another klant', async () => {
    // Sinds deze migratie is er wél een FK van klanten.kunstenaarnr naar
    // kunstenaars.kunstenaarnr, dus een kaal literal nummer kan niet meer -- de
    // fixture hieronder moet een echte kunstenaar zijn. De UNIQUE KEY op
    // klanten.kunstenaarnr is nog steeds wat hier getest wordt.
    const kunstenaar = await insertRow<{ id: string }>('kunstenaars', {
      naam: 'AUTOTEST Klanten FK Dubbel',
      kunstenaarnr: 'AT-K-KL-2',
      exclusieveKlantIds: [],
    } as never, ['exclusieveKlantIds']);
    createdKunstenaarIds.push(kunstenaar.id);
    const klantEen = await insertRow<{ id: string }>('klanten', {
      email: 'i@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klantEen.id);
    const klantTwee = await insertRow<{ id: string }>('klanten', {
      email: 'j@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klantTwee.id);

    const eerste = await patchKlant(
      req('PATCH', { kunstenaarnr: 'AT-K-KL-2' }, await medewerkerCookie()),
      { params: { id: klantEen.id } }
    );
    expect(eerste.status).toBe(200);

    const tweede = await patchKlant(
      req('PATCH', { kunstenaarnr: 'AT-K-KL-2' }, await medewerkerCookie()),
      { params: { id: klantTwee.id } }
    );
    expect(tweede.status).toBe(500);
    const body = await tweede.json();
    expect(body.error).toBe('server-error');

    const [rows] = await getPool().query('SELECT kunstenaarnr FROM klanten WHERE id = ?', [klantTwee.id]);
    expect((rows as Array<{ kunstenaarnr: string | null }>)[0].kunstenaarnr).toBeNull();
  });

  it('assigns a klantnummer when a klant is approved', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'klantnr-nieuw@example.com',
      wachtwoordHash: await hashPassword('x'),
      companyName: 'Nummerbedrijf BV',
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);

    const standVoor = await klantnummerStand();
    const response = await patchKlant(
      req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, await medewerkerCookie()),
      { params: { id: klant.id } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.klantnr).toBe(verwachtKlantnr(standVoor + 1));

    const [rows] = await getPool().query('SELECT klantnr, status FROM klanten WHERE id = ?', [klant.id]);
    const rij = (rows as Array<{ klantnr: string; status: string }>)[0];
    expect(rij.klantnr).toBe(verwachtKlantnr(standVoor + 1));
    expect(rij.status).toBe('Goedgekeurd');
  });

  it('keeps the same klantnummer when a klant is approved twice', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'klantnr-dubbel@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);

    const eerste = await patchKlant(
      req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, await medewerkerCookie()),
      { params: { id: klant.id } }
    );
    const eersteNr = (await eerste.json()).klantnr;

    const standNaEerste = await klantnummerStand();
    const tweede = await patchKlant(
      req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-2' }, await medewerkerCookie()),
      { params: { id: klant.id } }
    );

    expect((await tweede.json()).klantnr).toBe(eersteNr);
    expect(await klantnummerStand()).toBe(standNaEerste);
  });

  it('does not assign a klantnummer on a plain field update', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'klantnr-veld@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);

    const standVoor = await klantnummerStand();
    const response = await patchKlant(
      req('PATCH', { phone: '0612345678' }, await medewerkerCookie()),
      { params: { id: klant.id } }
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(await klantnummerStand()).toBe(standVoor);
    const [rows] = await getPool().query('SELECT klantnr FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ klantnr: string | null }>)[0].klantnr).toBeNull();
  });

  it('answers 404 when approving an unknown klant id, without advancing the klantnummer counter', async () => {
    const onbekendId = randomUUID();

    const standVoor = await klantnummerStand();
    const response = await patchKlant(
      req('PATCH', { status: 'Goedgekeurd', prijsgroepId: 'pg-1' }, await medewerkerCookie()),
      { params: { id: onbekendId } }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('klant-niet-gevonden');
    expect(await klantnummerStand()).toBe(standVoor);
    const [rows] = await getPool().query('SELECT id FROM klanten WHERE id = ?', [onbekendId]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('does not assign a klantnummer when a klant is rejected', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'klantnr-afgewezen@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);

    const standVoor = await klantnummerStand();
    await patchKlant(req('PATCH', { status: 'Afgewezen' }, await medewerkerCookie()), {
      params: { id: klant.id },
    });

    expect(await klantnummerStand()).toBe(standVoor);
    const [rows] = await getPool().query('SELECT klantnr FROM klanten WHERE id = ?', [klant.id]);
    expect((rows as Array<{ klantnr: string | null }>)[0].klantnr).toBeNull();
  });

  it('stores and returns an afwijsreden when a klant is rejected', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'afwijsreden@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Beoordelen',
    } as never);
    createdKlantIds.push(klant.id);

    await patchKlant(
      req(
        'PATCH',
        { status: 'Afgewezen', afwijsreden: 'Onvoldoende gegevens aangeleverd.' },
        await medewerkerCookie()
      ),
      { params: { id: klant.id } }
    );

    const [rows] = await getPool().query('SELECT status, afwijsreden FROM klanten WHERE id = ?', [klant.id]);
    const rij = (rows as Array<{ status: string; afwijsreden: string | null }>)[0];
    expect(rij.status).toBe('Afgewezen');
    expect(rij.afwijsreden).toBe('Onvoldoende gegevens aangeleverd.');
  });
});
