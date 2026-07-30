import { NextResponse } from 'next/server';
import { updateRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
