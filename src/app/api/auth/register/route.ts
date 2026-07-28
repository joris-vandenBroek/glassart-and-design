import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, ...rest } = body as { email: string; password: string } & Record<
    string,
    unknown
  >;

  const [existing] = await getPool().query('SELECT id FROM klanten WHERE email = ?', [email]);
  if ((existing as unknown[]).length > 0) {
    return NextResponse.json({ error: 'email-in-use' }, { status: 400 });
  }

  try {
    const wachtwoordHash = await hashPassword(password);
    await insertRow('klanten', {
      email,
      wachtwoordHash,
      status: 'Beoordelen',
      prijsgroepId: null,
      ...rest,
    } as never);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
