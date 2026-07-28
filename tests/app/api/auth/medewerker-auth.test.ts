import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { POST as medewerkerLogin } from '@/app/api/auth/medewerker-login/route';
import { GET as me } from '@/app/api/auth/me/route';

beforeEach(async () => {
  await getPool().query('DELETE FROM medewerkers');
  await getPool().query('DELETE FROM sessions');
});

describe('medewerker login route', () => {
  it('logs in a staff member and exposes them via /me?type=medewerker', async () => {
    await insertRow('medewerkers', {
      email: 'paul@glassartanddesign.com',
      wachtwoordHash: await hashPassword('staffpass'),
      naam: 'Paul',
    } as never);

    const response = await medewerkerLogin(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'paul@glassartanddesign.com', password: 'staffpass' }),
      })
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!;

    const meResponse = await me(
      new Request('http://localhost/api/auth/me?type=medewerker', { headers: { cookie } })
    );
    const body = await meResponse.json();
    expect(body.user.email).toBe('paul@glassartanddesign.com');
  });

  it('rejects an unknown email', async () => {
    const response = await medewerkerLogin(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@glassartanddesign.com', password: 'x' }),
      })
    );
    expect(response.status).toBe(401);
  });
});
