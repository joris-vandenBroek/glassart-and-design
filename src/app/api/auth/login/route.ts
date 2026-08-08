import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/password';
import { createSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const POST = withApiErrorHandling('POST /api/auth/login', async (request: Request) => {
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
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
});
