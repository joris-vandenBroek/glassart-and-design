import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

const ZENDINGNUMMER_PADDING = 5;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  void params.id;

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE counters SET value = value + 1 WHERE id = ?', ['zendingnummer']);
    const [valueRows] = await connection.query('SELECT value FROM counters WHERE id = ?', ['zendingnummer']);
    const nextValue = (valueRows as Array<{ value: number }>)[0].value;
    const zendingnummer = `ZD-${String(nextValue).padStart(ZENDINGNUMMER_PADDING, '0')}`;
    await connection.commit();
    return NextResponse.json({ zendingnummer });
  } catch {
    await connection.rollback();
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  } finally {
    connection.release();
  }
}
