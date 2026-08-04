import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { GET as getMe, PATCH as patchMe } from '@/app/api/klanten/me/route';

// Every klant this suite creates uses a @example.com address, so cleanup is scoped
// to exactly those ids -- never a table-wide DELETE -- and is safe to run against a
// klanten table that already holds real customer registrations.
const createdKlantIds: string[] = [];

afterEach(async () => {
  if (createdKlantIds.length > 0) {
    await getPool().query('DELETE FROM sessions WHERE userId IN (?)', [createdKlantIds]);
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
          kunstenaarId: 'kunstenaar-1',
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
});
