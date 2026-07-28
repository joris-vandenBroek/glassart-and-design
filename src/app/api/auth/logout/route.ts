import { NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function POST(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (match) {
    await destroySession(match[1]);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}
