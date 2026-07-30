import { NextResponse } from 'next/server';
import { getRow } from '@/lib/server/crud';
import { validateSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling('GET /api/auth/me', async (request: Request) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'klant';
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) {
    return NextResponse.json({ user: null });
  }
  const session = await validateSession(match[1]);
  if (!session || session.userType !== type) {
    return NextResponse.json({ user: null });
  }
  const table = type === 'klant' ? 'klanten' : 'medewerkers';
  const user = await getRow<Record<string, unknown>>(table, session.userId);
  if (!user) {
    return NextResponse.json({ user: null });
  }
  const { wachtwoordHash: _wachtwoordHash, ...safeUser } = user;
  return NextResponse.json({ user: safeUser });
});
