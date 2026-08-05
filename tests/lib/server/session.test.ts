import { describe, expect, it, afterEach } from 'vitest';
import { getPool } from '@/lib/server/db';
import { createSession, validateSession, destroySession } from '@/lib/server/session';

// Tracks the exact session ids each test creates and removes only those afterward.
// createSession() here always uses a fake fixture userId ('klant-123'/'staff-1'/etc, none
// of which have a real klanten/medewerkers row), so nothing else would ever clean these up.
const createdSessionIds: string[] = [];

afterEach(async () => {
  if (createdSessionIds.length > 0) {
    await getPool().query('DELETE FROM sessions WHERE id IN (?)', [createdSessionIds]);
    createdSessionIds.length = 0;
  }
});

describe('sessions', () => {
  it('creates a session and validates it', async () => {
    const sessionId = await createSession('klant', 'klant-123');
    createdSessionIds.push(sessionId);
    const result = await validateSession(sessionId);
    expect(result).toEqual({ userType: 'klant', userId: 'klant-123' });
  });

  it('returns null for an unknown session id', async () => {
    expect(await validateSession('does-not-exist')).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const sessionId = await createSession('medewerker', 'staff-1');
    createdSessionIds.push(sessionId);
    await getPool().query('UPDATE sessions SET expiresAt = NOW() - INTERVAL 1 DAY WHERE id = ?', [
      sessionId,
    ]);
    expect(await validateSession(sessionId)).toBeNull();
  });

  it('destroys a session', async () => {
    const sessionId = await createSession('klant', 'klant-456');
    // Not pushed to createdSessionIds -- destroySession() below already removes the row,
    // so tracking it too would just make afterEach's cleanup a harmless no-op for this id.
    await destroySession(sessionId);
    expect(await validateSession(sessionId)).toBeNull();
  });
});
