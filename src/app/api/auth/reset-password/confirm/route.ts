import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashPassword, valideerWachtwoord } from '@/lib/server/password';
import { destroySessionsForUser } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const POST = withApiErrorHandling('POST /api/auth/reset-password/confirm', async (request: Request) => {
  const { token, newPassword } = (await request.json()) as { token: string; newPassword: string };

  // Stond alleen in ResetPasswordForm.tsx, dus een directe POST kon elk
  // wachtwoord zetten -- ook een lege string.
  const wachtwoordFout = valideerWachtwoord(newPassword);
  if (wachtwoordFout !== 'ok') {
    return NextResponse.json({ error: `password-${wachtwoordFout}` }, { status: 400 });
  }

  const [rows] = await getPool().query(
    'SELECT userType, userId FROM passwordResetTokens WHERE token = ? AND expiresAt > NOW()',
    [token]
  );
  const record = (rows as Array<{ userType: 'klant' | 'medewerker'; userId: string }>)[0];
  if (!record) {
    return NextResponse.json({ error: 'invalid-token' }, { status: 400 });
  }

  const table = record.userType === 'klant' ? 'klanten' : 'medewerkers';
  const wachtwoordHash = await hashPassword(newPassword);
  await getPool().query(`UPDATE \`${table}\` SET wachtwoordHash = ? WHERE id = ?`, [
    wachtwoordHash,
    record.userId,
  ]);

  // Alle openstaande tokens van deze gebruiker vervallen, niet alleen de gebruikte:
  // een tweede aangevraagde link bleef anders 24 uur lang bruikbaar.
  await getPool().query('DELETE FROM passwordResetTokens WHERE userType = ? AND userId = ?', [
    record.userType,
    record.userId,
  ]);
  // En elke bestaande sessie gaat eruit. Wie zijn wachtwoord reset omdat iemand
  // anders erin zat, verwacht dat die ander eruit ligt -- dat gebeurde niet
  // zolang alleen de hash werd bijgewerkt.
  await destroySessionsForUser(record.userType, record.userId);

  return NextResponse.json({ ok: true });
});
