import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';

export async function POST(request: Request) {
  const { token, newPassword } = (await request.json()) as { token: string; newPassword: string };

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
  await getPool().query('DELETE FROM passwordResetTokens WHERE token = ?', [token]);

  return NextResponse.json({ ok: true });
}
