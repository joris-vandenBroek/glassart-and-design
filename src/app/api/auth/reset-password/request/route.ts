import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { randomUUID } from 'crypto';
import { sendResetEmail } from '@/lib/server/sendResetEmail';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { routing } from '@/i18n/routing';

/**
 * De locale belandt als pad in een link in een uitgaande e-mail. Alles wat niet
 * letterlijk een van onze eigen locales is, wordt `nl` -- niet omdat de gebruiker
 * zich vergist kan hebben, maar omdat een willekeurige string uit de request-body
 * anders in een bericht terechtkomt dat wij namens onszelf versturen.
 */
function veiligeLocale(waarde: unknown): string {
  const locales: readonly string[] = routing.locales;
  return typeof waarde === 'string' && locales.includes(waarde) ? waarde : routing.defaultLocale;
}

export const POST = withApiErrorHandling('POST /api/auth/reset-password/request', async (request: Request) => {
  const { email, userType, locale } = (await request.json()) as {
    email: string;
    userType: 'klant' | 'medewerker';
    locale?: unknown;
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
    await sendResetEmail(email, token, new URL(request.url).origin, veiligeLocale(locale));
  }

  return NextResponse.json({ ok: true });
});
