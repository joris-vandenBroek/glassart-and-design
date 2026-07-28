import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/server/session';

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email: string; password: string };

  const [rows] = await getPool().query(
    'SELECT id, wachtwoordHash, status FROM klanten WHERE email = ?',
    [email]
  );
  const klant = (rows as Array<{ id: string; wachtwoordHash: string; status: string }>)[0];
  if (!klant || !(await verifyPassword(password, klant.wachtwoordHash))) {
    return NextResponse.json({ error: 'invalid-credentials' }, { status: 401 });
  }

  const sessionId = await createSession('klant', klant.id);
  const response = NextResponse.json({ status: klant.status }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
