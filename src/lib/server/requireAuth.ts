import { validateSession, SESSION_COOKIE_NAME } from './session';

function sessionIdFromRequest(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function requireMedewerker(request: Request): Promise<string | null> {
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return null;
  const session = await validateSession(sessionId);
  if (!session || session.userType !== 'medewerker') return null;
  return session.userId;
}

export async function requireKlant(request: Request): Promise<string | null> {
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return null;
  const session = await validateSession(sessionId);
  if (!session || session.userType !== 'klant') return null;
  return session.userId;
}
