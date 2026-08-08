import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

export const GET = withMedewerker<{ params: { id: string } }>(
  'GET /api/bestelheaders/[id]/statushistorie',
  async (_request, { params }) => {
    const [rows] = await getPool().query(
      'SELECT status, tijdstip FROM bestelstatusHistorie WHERE bestelheaderId = ? ORDER BY tijdstip ASC',
      [params.id]
    );
    return NextResponse.json(rows);
  }
);
