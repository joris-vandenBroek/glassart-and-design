import { randomUUID } from 'crypto';
import type { Pool } from 'mysql2/promise';
import { getPool } from './db';

export const SESSION_COOKIE_NAME = 'session_id';
const SESSION_LIFETIME_DAYS = 30;

export type UserType = 'klant' | 'medewerker';

/**
 * De cookie-instellingen die bij élke sessiecookie horen. Stonden eerder los in
 * /api/auth/login en /api/auth/medewerker-login, waar ze uit elkaar konden lopen.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * SESSION_LIFETIME_DAYS,
} as const;

/** Leest de sessie-id uit de Cookie-header. Stond eerder drie keer gekopieerd. */
export function sessionIdFromRequest(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

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

/**
 * Gooit élke sessie van één gebruiker weg. Wordt gebruikt na een wachtwoord-
 * wijziging: wie zijn wachtwoord verandert omdat het gelekt is, verwacht dat de
 * ander er daarmee uit ligt -- en dat gebeurde niet zolang alleen de hash werd
 * bijgewerkt.
 *
 * `connection` is optioneel, net als bij `updateRow`/`insertRow`: het uitlogeffect
 * hoort bij dezelfde transactie als de nieuwe hash, anders kan het één van tweeën
 * blijven staan.
 */
export async function destroySessionsForUser(
  userType: UserType,
  userId: string,
  connection?: Pick<Pool, 'query'>
): Promise<void> {
  await (connection ?? getPool()).query('DELETE FROM sessions WHERE userType = ? AND userId = ?', [
    userType,
    userId,
  ]);
}

/**
 * Ruimt verlopen sessies en resettokens op. Deze rijen bleven eerder voor altijd
 * staan; `validateSession` negeerde ze wel, maar ze bleven een groeiende lijst
 * met bruikbaar ogende tokens in de database.
 */
export async function ruimVerlopenSessiesOp(): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE expiresAt <= NOW()');
  await getPool().query('DELETE FROM passwordResetTokens WHERE expiresAt <= NOW()');
}
