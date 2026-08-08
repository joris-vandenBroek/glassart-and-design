import { NextResponse } from 'next/server';
import { destroySession, sessionIdFromRequest, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const POST = withApiErrorHandling('POST /api/auth/logout', async (request: Request) => {
  const sessionId = sessionIdFromRequest(request);
  if (sessionId) {
    await destroySession(sessionId);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
});
