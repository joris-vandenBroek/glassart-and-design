import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT * FROM drukkerZendingen WHERE drukkerId = ? ORDER BY verzondenOp DESC',
    [params.id]
  );
  const parsed = (rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    bestellingIds: typeof row.bestellingIds === 'string' ? JSON.parse(row.bestellingIds) : row.bestellingIds,
  }));
  return NextResponse.json(parsed);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow(
      'drukkerZendingen',
      { drukkerId: params.id, ...data },
      ['bestellingIds']
    );
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
