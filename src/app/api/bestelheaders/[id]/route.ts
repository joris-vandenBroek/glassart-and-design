import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getRow, updateRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

export const PATCH = withMedewerker<{ params: { id: string } }>(
  'PATCH /api/bestelheaders/[id]',
  async (request, { params }) => {
    const data = await request.json();
    if ('status' in data) {
      const current = await getRow<{ status: string; bestelnr: string }>('bestelheaders', params.id);
      if (current && current.status !== data.status) {
        await getPool().query(
          'INSERT INTO bestelstatusHistorie (id, bestelnr, status) VALUES (?, ?, ?)',
          [randomUUID(), current.bestelnr, data.status]
        );
      }
    }
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  }
);
