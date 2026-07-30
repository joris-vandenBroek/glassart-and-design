import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { randomUUID } from 'crypto';
import { sendResetEmail } from '@/lib/server/sendResetEmail';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const POST = withApiErrorHandling('POST /api/auth/reset-password/request', async (request: Request) => {
  const { email, userType } = (await request.json()) as {
    email: string;
    userType: 'klant' | 'medewerker';
  };
  const table = userType === 'klant' ? 'klanten' : 'medewerkers';

  const [rows] = await getPool().query(`SELECT id FROM \`${table}\` WHERE email = ?`, [email]);
  const user = (rows as Array<{ id: string }>)[0];

  if (user) {
    const token = randomUUID();
    await getPool().query(
      'INSERT INTO passwordResetTokens (token, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
      [token, userType, user.id]
    );
    await sendResetEmail(email, token, new URL(request.url).origin);
  }

  return NextResponse.json({ ok: true });
});
