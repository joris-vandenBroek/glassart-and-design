import { validateSession, SESSION_COOKIE_NAME } from './session';

export async function requireMedewerker(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const session = await validateSession(match[1]);
  if (!session || session.userType !== 'medewerker') return null;
  return session.userId;
}
