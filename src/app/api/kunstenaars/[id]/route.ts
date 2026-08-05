import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

const KUNSTENAARS_JSON_COLUMNS = ['exclusieveKlantIds'];

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const row = await getRow('kunstenaars', params.id, KUNSTENAARS_JSON_COLUMNS);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('kunstenaars', params.id, data, KUNSTENAARS_JSON_COLUMNS);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    // KunstenaarsSection.tsx already blocks this client-side against already-loaded
    // kunstwerken, but that's only a UX nicety -- without this, a direct API call (or
    // stale client state) would previously hit kunstwerken.kunstenaarId's unnamed FK
    // constraint as an uncaught exception instead of a clean response.
    const [rows] = await getPool().query('SELECT 1 FROM kunstwerken WHERE kunstenaarId = ? LIMIT 1', [params.id]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    await deleteRow('kunstenaars', params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
