import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { POST as medewerkerLogin } from '@/app/api/auth/medewerker-login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { veiligOpruimen } from '../../../helpers/veiligOpruimen';

// Uses a clearly-fake @example.com test email -- never a real @glassartanddesign.com
// address -- so this can never collide with (or require wiping) a real migrated
// medewerker account like paul@glassartanddesign.com.
const TEST_EMAIL = 'test-medewerker@example.com';

afterEach(async () => {
  await veiligOpruimen('sessions (medewerker)', () =>
    getPool().query(
      "DELETE FROM sessions WHERE userType = 'medewerker' AND userId IN (SELECT id FROM medewerkers WHERE email = ?)",
      [TEST_EMAIL]
    )
  );
  await veiligOpruimen('medewerkers', () =>
    getPool().query('DELETE FROM medewerkers WHERE email = ?', [TEST_EMAIL])
  );
});

describe('medewerker login route', () => {
  it('logs in a staff member and exposes them via /me?type=medewerker', async () => {
    await insertRow('medewerkers', {
      email: TEST_EMAIL,
      wachtwoordHash: await hashPassword('staffpass'),
      naam: 'Paul',
    } as never);

    const response = await medewerkerLogin(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: 'staffpass' }),
      })
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!;

    const meResponse = await me(
      new Request('http://localhost/api/auth/me?type=medewerker', { headers: { cookie } })
    );
    const body = await meResponse.json();
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.user.wachtwoordHash).toBeUndefined();
  });

  it('rejects an unknown email', async () => {
    const response = await medewerkerLogin(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nobody-test@example.com', password: 'x' }),
      })
    );
    expect(response.status).toBe(401);
  });
});
