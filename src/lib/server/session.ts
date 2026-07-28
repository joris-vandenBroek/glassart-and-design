import { randomUUID } from 'crypto';
import { getPool } from './db';

export const SESSION_COOKIE_NAME = 'session_id';
const SESSION_LIFETIME_DAYS = 30;

export type UserType = 'klant' | 'medewerker';

export async function createSession(userType: UserType, userId: string): Promise<string> {
  const id = randomUUID();
  await getPool().query(
    'INSERT INTO sessions (id, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
    [id, userType, userId, SESSION_LIFETIME_DAYS]
  );
  return id;
}

export async function validateSession(
  sessionId: string
): Promise<{ userType: UserType; userId: string } | null> {
  const [rows] = await getPool().query(
    'SELECT userType, userId FROM sessions WHERE id = ? AND expiresAt > NOW()',
    [sessionId]
  );
  const row = (rows as Array<{ userType: UserType; userId: string }>)[0];
  return row ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE id = ?', [sessionId]);
}
