import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { requireMedewerker } from '@/lib/server/requireAuth';

function requestWithCookie(sessionId?: string) {
  return new Request('http://localhost/api', {
    headers: sessionId ? { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` } : {},
  });
}

// createSession() here always uses a fake fixture userId ('staff-1'/'klant-1', neither has
// a real klanten/medewerkers row), so nothing else would ever clean these sessions up.
const createdSessionIds: string[] = [];

afterEach(async () => {
  if (createdSessionIds.length > 0) {
    await getPool().query('DELETE FROM sessions WHERE id IN (?)', [createdSessionIds]);
    createdSessionIds.length = 0;
  }
});

describe('requireMedewerker', () => {
  it('returns the userId for a valid medewerker session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    createdSessionIds.push(sessionId);
    expect(await requireMedewerker(requestWithCookie(sessionId))).toBe('staff-1');
  });

  it('returns null when there is no session cookie', async () => {
    expect(await requireMedewerker(requestWithCookie())).toBeNull();
  });

  it('returns null for a klant session (wrong user type)', async () => {
    const sessionId = await createSession('klant', 'klant-1');
    createdSessionIds.push(sessionId);
    expect(await requireMedewerker(requestWithCookie(sessionId))).toBeNull();
  });
});
