import { sessionIdFromRequest, validateSession, type UserType } from './session';

async function requireUser(request: Request, userType: UserType): Promise<string | null> {
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return null;
  const session = await validateSession(sessionId);
  if (!session || session.userType !== userType) return null;
  return session.userId;
}

export async function requireMedewerker(request: Request): Promise<string | null> {
  return requireUser(request, 'medewerker');
}

export async function requireKlant(request: Request): Promise<string | null> {
  return requireUser(request, 'klant');
}
