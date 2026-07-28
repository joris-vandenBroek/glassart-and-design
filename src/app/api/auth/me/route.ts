import { NextResponse } from 'next/server';
import { getRow } from '@/lib/server/crud';
import { validateSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function GET(request: Request) {
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
  const user = await getRow(table, session.userId);
  return NextResponse.json({ user });
}
