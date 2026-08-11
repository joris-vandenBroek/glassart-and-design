import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getRow } from '@/lib/server/crud';
import { withMedewerker } from '@/lib/server/apiRoute';

export const GET = withMedewerker<{ params: { id: string } }>(
  'GET /api/bestelheaders/[id]/statushistorie',
  async (_request, { params }) => {
    const header = await getRow<{ bestelnr: string }>('bestelheaders', params.id);
    if (!header) {
      return NextResponse.json([]);
    }
    const [rows] = await getPool().query(
      'SELECT status, tijdstip FROM bestelstatusHistorie WHERE bestelnr = ? ORDER BY tijdstip ASC',
      [header.bestelnr]
    );
    return NextResponse.json(rows);
  }
);
