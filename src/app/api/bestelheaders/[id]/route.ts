import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getRow, updateRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if ('status' in data) {
      const current = await getRow<{ status: string }>('bestelheaders', params.id);
      if (current && current.status !== data.status) {
        await getPool().query('INSERT INTO bestelstatusHistorie (id, bestelheaderId, status) VALUES (?, ?, ?)', [
          randomUUID(),
          params.id,
          data.status,
        ]);
      }
    }
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
