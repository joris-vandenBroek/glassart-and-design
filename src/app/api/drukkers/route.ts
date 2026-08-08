import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

export const GET = withMedewerker('GET /api/drukkers', async () => {
  const rows = await listRows<{ id: string; standaard?: boolean }>('drukkers');
  return NextResponse.json(rows.map((row) => ({ ...row, standaard: Boolean(row.standaard) })));
});

export const POST = withMedewerker('POST /api/drukkers', async (request: Request) => {
  const data = await request.json();
  if (data.standaard) {
    await getPool().query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE');
  }
  const created = await insertRow('drukkers', data);
  return NextResponse.json(created, { status: 201 });
});
