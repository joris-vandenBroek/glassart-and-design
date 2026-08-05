import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const row = await getRow<{ id: string; standaard?: boolean }>('drukkers', params.id);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json({ ...row, standaard: Boolean(row.standaard) });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if (data.standaard) {
      await getPool().query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE AND id != ?', [
        params.id,
      ]);
    }
    await updateRow('drukkers', params.id, data);
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
    // drukkerZendingen.drukkerId is ON DELETE CASCADE, so without this check a delete
    // would silently succeed and take real verzendhistorie (audit trail) down with it.
    // DrukkerModal.tsx already blocks this client-side against already-loaded zendingen,
    // but that's only a UX nicety against a direct API call or stale client state.
    const [rows] = await getPool().query('SELECT 1 FROM drukkerZendingen WHERE drukkerId = ? LIMIT 1', [
      params.id,
    ]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    await deleteRow('drukkers', params.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
