import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

const BESTELLINE_COLUMNS = ['materiaalId', 'maatId', 'prijs', 'quantity', 'breedte', 'hoogte'];

export const PATCH = withApiErrorHandling(
  'PATCH /api/bestelheaders/[id]/bestellines/[lineId]',
  async (request: Request, { params }: { params: { id: string; lineId: string } }) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const data = (await request.json()) as Record<string, unknown>;
  const columns = Object.keys(data).filter((key) => BESTELLINE_COLUMNS.includes(key));
  if (columns.length === 0) {
    return NextResponse.json({ ok: true });
  }
  const assignments = columns.map((column) => `\`${column}\` = ?`).join(', ');
  const values = columns.map((column) => data[column]);
  await getPool().query(
    `UPDATE bestellines SET ${assignments} WHERE id = ? AND bestelheaderId = ?`,
    [...values, params.lineId, params.id]
  );
  return NextResponse.json({ ok: true });
  }
);
