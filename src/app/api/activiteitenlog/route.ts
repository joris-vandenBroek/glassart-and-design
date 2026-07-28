import { NextResponse } from 'next/server';
import { insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { ACTIVITEIT_TYPES } from '@/lib/logActiviteit';

export async function POST(request: Request) {
  const data = await request.json();
  if (!ACTIVITEIT_TYPES.includes(data.type)) {
    return NextResponse.json({ error: 'invalid-type' }, { status: 400 });
  }
  try {
    await insertRow('activiteitenlog', data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function GET() {
  const [rows] = await getPool().query(
    'SELECT * FROM activiteitenlog ORDER BY timestamp DESC LIMIT 500'
  );
  return NextResponse.json(rows);
}
