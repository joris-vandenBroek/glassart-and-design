import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT status, tijdstip FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
    [params.id]
  );
  return NextResponse.json(rows);
}
