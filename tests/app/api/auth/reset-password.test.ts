import { describe, expect, it, vi, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';

vi.mock('@/lib/server/sendResetEmail', () => ({ sendResetEmail: vi.fn().mockResolvedValue(undefined) }));

import { POST as requestReset } from '@/app/api/auth/reset-password/request/route';
import { POST as confirmReset } from '@/app/api/auth/reset-password/confirm/route';

// Every test uses a @example.com address -- a domain no real customer would
// plausibly use -- so cleanup is scoped to exactly that pattern instead of a
// table-wide DELETE, never touching a real customer or their reset tokens.
afterEach(async () => {
  await getPool().query(
    "DELETE FROM passwordResetTokens WHERE userId IN (SELECT id FROM klanten WHERE email LIKE '%@example.com')"
  );
  await getPool().query("DELETE FROM klanten WHERE email LIKE '%@example.com'");
});

describe('password reset routes', () => {
  it('creates a reset token for a known klant email and confirms a new password', async () => {
    const klant = await insertRow<{ id: string; email: string }>('klanten', {
      email: 'reset@example.com',
      wachtwoordHash: await hashPassword('oldpass'),
      status: 'Goedgekeurd',
    } as never);

    const requestResponse = await requestReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'reset@example.com', userType: 'klant' }),
      })
    );
    expect(requestResponse.status).toBe(200);

    const [tokenRows] = await getPool().query(
      'SELECT token FROM passwordResetTokens WHERE userId = ?',
      [klant.id]
    );
    const token = (tokenRows as Array<{ token: string }>)[0].token;

    const confirmResponse = await confirmReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: 'newpass123' }),
      })
    );
    expect(confirmResponse.status).toBe(200);

    const [klantRows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [
      klant.id,
    ]);
    const updatedHash = (klantRows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash;
    expect(await verifyPassword('newpass123', updatedHash)).toBe(true);
  });

  it('does not leak whether an email exists (always 200)', async () => {
    const response = await requestReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'unknown@example.com', userType: 'klant' }),
      })
    );
    expect(response.status).toBe(200);
  });

  it('rejects confirm with an unknown token', async () => {
    const response = await confirmReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'does-not-exist', newPassword: 'x' }),
      })
    );
    expect(response.status).toBe(400);
  });
});
