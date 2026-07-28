import { NextResponse } from 'next/server';
import { updateRow, deleteRow } from '@/lib/server/crud';

const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await request.json();
    await updateRow('klanten', params.id, data, KLANTEN_JSON_COLUMNS);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await deleteRow('klanten', params.id);
  return NextResponse.json({ ok: true });
}
