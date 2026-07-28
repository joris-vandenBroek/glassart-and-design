import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email: string; password: string };

  const [rows] = await getPool().query('SELECT id, wachtwoordHash FROM medewerkers WHERE email = ?', [
    email,
  ]);
  const medewerker = (rows as Array<{ id: string; wachtwoordHash: string }>)[0];
  if (!medewerker || !(await verifyPassword(password, medewerker.wachtwoordHash))) {
    return NextResponse.json({ error: 'invalid-credentials' }, { status: 401 });
  }

  const sessionId = await createSession('medewerker', medewerker.id);
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
