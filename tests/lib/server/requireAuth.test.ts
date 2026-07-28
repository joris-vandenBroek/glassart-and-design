import { describe, expect, it, beforeEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { requireMedewerker } from '@/lib/server/requireAuth';

beforeEach(async () => {
  await getPool().query('DELETE FROM sessions');
});

function requestWithCookie(sessionId?: string) {
  return new Request('http://localhost/api', {
    headers: sessionId ? { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` } : {},
  });
}

describe('requireMedewerker', () => {
  it('returns the userId for a valid medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    expect(await requireMedewerker(requestWithCookie(sessionId))).toBe('staff-1');
  });

  it('returns null when there is no session cookie', async () => {
    expect(await requireMedewerker(requestWithCookie())).toBeNull();
  });

  it('returns null for a klant session (wrong user type)', async () => {
    const sessionId = await createSession('klant', 'klant-1');
    expect(await requireMedewerker(requestWithCookie(sessionId))).toBeNull();
  });
});
