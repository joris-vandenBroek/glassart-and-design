import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const row = await getRow('drukkers', params.id);
  if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if (data.standaard === true) {
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
  await deleteRow('drukkers', params.id);
  return NextResponse.json({ ok: true });
}
