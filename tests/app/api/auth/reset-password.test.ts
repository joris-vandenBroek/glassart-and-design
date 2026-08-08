import { describe, expect, it, vi, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { createSession, validateSession } from '@/lib/server/session';

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
  // Sessies horen bij dezelfde fixture-klanten en zouden anders als weesrijen
  // blijven staan -- ook hier scoped op de @example.com-klanten, nooit breder.
  await getPool().query(
    "DELETE FROM sessions WHERE userType = 'klant' AND userId IN (SELECT id FROM klanten WHERE email LIKE '%@example.com')"
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

  // De 8-tekens-eis stond alleen in ResetPasswordForm.tsx; een directe POST kon
  // elk wachtwoord zetten, ook een lege string.
  it('weigert een te kort of ontbrekend wachtwoord', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'reset-kort@example.com',
      wachtwoordHash: await hashPassword('oudwachtwoord'),
      status: 'Goedgekeurd',
    } as never);
    await requestReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'reset-kort@example.com', userType: 'klant' }),
      })
    );
    const [tokenRows] = await getPool().query('SELECT token FROM passwordResetTokens WHERE userId = ?', [
      klant.id,
    ]);
    const token = (tokenRows as Array<{ token: string }>)[0].token;

    for (const newPassword of ['kort', '', undefined]) {
      const response = await confirmReset(
        new Request('http://localhost/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, newPassword }),
        })
      );
      expect(response.status).toBe(400);
    }

    const [klantRows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [klant.id]);
    expect(
      await verifyPassword('oudwachtwoord', (klantRows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash)
    ).toBe(true);
  });

  // Wie zijn wachtwoord reset omdat iemand anders erin zat, verwacht dat die
  // ander eruit ligt. Dat gebeurde niet zolang alleen de hash werd bijgewerkt.
  it('gooit bestaande sessies en overige resettokens weg na een geslaagde reset', async () => {
    const klant = await insertRow<{ id: string }>('klanten', {
      email: 'reset-sessies@example.com',
      wachtwoordHash: await hashPassword('oudwachtwoord'),
      status: 'Goedgekeurd',
    } as never);
    const sessieId = await createSession('klant', klant.id);

    // Twee keer aanvragen: de tweede link mag de eerste niet laten voortleven.
    for (let i = 0; i < 2; i += 1) {
      await requestReset(
        new Request('http://localhost/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'reset-sessies@example.com', userType: 'klant' }),
        })
      );
    }
    const [tokenRows] = await getPool().query('SELECT token FROM passwordResetTokens WHERE userId = ?', [
      klant.id,
    ]);
    const tokens = (tokenRows as Array<{ token: string }>).map((rij) => rij.token);
    expect(tokens.length).toBe(2);

    const response = await confirmReset(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tokens[0], newPassword: 'nieuwwachtwoord' }),
      })
    );
    expect(response.status).toBe(200);

    expect(await validateSession(sessieId)).toBeNull();
    const [restTokens] = await getPool().query('SELECT token FROM passwordResetTokens WHERE userId = ?', [
      klant.id,
    ]);
    expect((restTokens as unknown[]).length).toBe(0);
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
