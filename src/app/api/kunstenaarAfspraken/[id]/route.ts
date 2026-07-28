import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT prijsafspraken FROM kunstenaarAfspraken WHERE id = ?',
    [params.id]
  );
  const row = (rows as Array<{ prijsafspraken: string | null }>)[0];
  return NextResponse.json({ prijsafspraken: row?.prijsafspraken ?? null });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { prijsafspraken } = (await request.json()) as { prijsafspraken: string };
  await getPool().query(
    'INSERT INTO kunstenaarAfspraken (id, prijsafspraken) VALUES (?, ?) ON DUPLICATE KEY UPDATE prijsafspraken = VALUES(prijsafspraken)',
    [params.id, prijsafspraken]
  );
  return NextResponse.json({ ok: true });
}
