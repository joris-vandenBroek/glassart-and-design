import { describe, expect, it, afterEach } from 'vitest';
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

afterEach(async () => {
  if (createdKlantIds.length > 0) {
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
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

async function medewerkerCookie(): Promise<string> {
  const sessionId = await createSession('medewerker', 'staff-1');
  return `${SESSION_COOKIE_NAME}=${sessionId}`;
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

  it('round-trips kunstenaarId as a plain scalar', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'd@example.com',
      wachtwoordHash: await hashPassword('x'),
      status: 'Goedgekeurd',
    } as never);
    createdKlantIds.push(klant.id);
    await patchKlant(req('PATCH', { kunstenaarId: 'kunstenaar-1' }, await medewerkerCookie()), {
      params: { id: klant.id },
    });
    const response = await listKlanten(req('GET', undefined, await medewerkerCookie()));
    const body = await response.json();
    const updated = body.find((row: { id: string }) => row.id === klant.id);
    expect(updated.kunstenaarId).toBe('kunstenaar-1');
  });

  it('rejects linking a second klant to a kunstenaarId already claimed by another klant', async () => {
    // No FK from klanten.kunstenaarId to kunstenaars.id, so a bare literal id is fine here --
    // only the UNIQUE KEY on klanten.kunstenaarId is under test.
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
      req('PATCH', { kunstenaarId: 'kunstenaar-dubbel' }, await medewerkerCookie()),
      { params: { id: klantEen.id } }
    );
    expect(eerste.status).toBe(200);

    const tweede = await patchKlant(
      req('PATCH', { kunstenaarId: 'kunstenaar-dubbel' }, await medewerkerCookie()),
      { params: { id: klantTwee.id } }
    );
    expect(tweede.status).toBe(500);
    const body = await tweede.json();
    expect(body.error).toBe('server-error');

    const [rows] = await getPool().query('SELECT kunstenaarId FROM klanten WHERE id = ?', [klantTwee.id]);
    expect((rows as Array<{ kunstenaarId: string | null }>)[0].kunstenaarId).toBeNull();
  });
});
