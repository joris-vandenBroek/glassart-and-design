import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await listRows<{ id: string; standaard?: boolean }>('drukkers');
  return NextResponse.json(rows.map((row) => ({ ...row, standaard: Boolean(row.standaard) })));
}

export async function POST(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if (data.standaard) {
      await getPool().query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE');
    }
    const created = await insertRow('drukkers', data);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
