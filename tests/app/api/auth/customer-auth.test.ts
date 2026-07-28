import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';

function jsonRequest(body: unknown, cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

// Every test registers a real klant via a @example.com address -- a domain no real
// customer would plausibly use -- so cleanup is scoped to exactly that pattern
// instead of a table-wide DELETE, never touching a real customer registration.
afterEach(async () => {
  await getPool().query(
    "DELETE FROM sessions WHERE userType = 'klant' AND userId IN (SELECT id FROM klanten WHERE email LIKE '%@example.com')"
  );
  await getPool().query("DELETE FROM klanten WHERE email LIKE '%@example.com'");
});

describe('customer auth routes', () => {
  it('registers a new klant and returns 201', async () => {
    const response = await register(
      jsonRequest({
        email: 'klant@example.com',
        password: 'wachtwoord123',
        companyName: 'Acme BV',
        contactPerson: 'Jan',
      })
    );
    expect(response.status).toBe(201);
  });

  it('rejects registering the same email twice', async () => {
    await register(jsonRequest({ email: 'dup@example.com', password: 'x', companyName: 'A' }));
    const second = await register(
      jsonRequest({ email: 'dup@example.com', password: 'x', companyName: 'A' })
    );
    expect(second.status).toBe(400);
  });

  it('logs in with correct credentials and sets a session cookie', async () => {
    await register(
      jsonRequest({ email: 'login@example.com', password: 'geheim123', companyName: 'A' })
    );
    const response = await login(jsonRequest({ email: 'login@example.com', password: 'geheim123' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/session_id=/);
    const body = await response.json();
    expect(body.status).toBe('Beoordelen');
  });

  it('rejects login with wrong password', async () => {
    await register(jsonRequest({ email: 'wrong@example.com', password: 'right', companyName: 'A' }));
    const response = await login(jsonRequest({ email: 'wrong@example.com', password: 'wrong' }));
    expect(response.status).toBe(401);
  });

  it('returns the current user from /me using the session cookie, and null after logout', async () => {
    await register(
      jsonRequest({ email: 'me@example.com', password: 'geheim123', companyName: 'A' })
    );
    const loginResponse = await login(jsonRequest({ email: 'me@example.com', password: 'geheim123' }));
    const cookie = loginResponse.headers.get('set-cookie')!;

    const meResponse = await me(
      new Request('http://localhost/api/auth/me?type=klant', { headers: { cookie } })
    );
    const meBody = await meResponse.json();
    expect(meBody.user.email).toBe('me@example.com');

    await logout(jsonRequest({}, cookie));
    const afterLogout = await me(
      new Request('http://localhost/api/auth/me?type=klant', { headers: { cookie } })
    );
    const afterLogoutBody = await afterLogout.json();
    expect(afterLogoutBody.user).toBeNull();
  });
});
