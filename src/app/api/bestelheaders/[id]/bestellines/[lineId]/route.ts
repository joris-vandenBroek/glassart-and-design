import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; lineId: string } }
) {
  const { prijs } = (await request.json()) as { prijs: number };
  await getPool().query('UPDATE bestellines SET prijs = ? WHERE id = ? AND bestelheaderId = ?', [
    prijs,
    params.lineId,
    params.id,
  ]);
  return NextResponse.json({ ok: true });
}
