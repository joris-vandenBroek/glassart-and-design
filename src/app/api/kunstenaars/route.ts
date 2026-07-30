import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

const KUNSTENAARS_JSON_COLUMNS = ['exclusieveKlantIds'];

export async function GET() {
  const rows = await listRows('kunstenaars', KUNSTENAARS_JSON_COLUMNS);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow('kunstenaars', data, KUNSTENAARS_JSON_COLUMNS);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
