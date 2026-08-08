import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { insertRow, parseJsonKolom } from '@/lib/server/crud';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

export const GET = withMedewerker<Context>(
  'GET /api/drukkers/[id]/zendingen',
  async (_request, { params }) => {
    const [rows] = await getPool().query(
      'SELECT * FROM drukkerZendingen WHERE drukkerId = ? ORDER BY verzondenOp DESC',
      [params.id]
    );
    const parsed = (rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      bestellingIds: parseJsonKolom<string[]>(row.bestellingIds, []),
    }));
    return NextResponse.json(parsed);
  }
);

export const POST = withMedewerker<Context>(
  'POST /api/drukkers/[id]/zendingen',
  async (request, { params }) => {
    const data = await request.json();
    const created = await insertRow('drukkerZendingen', { drukkerId: params.id, ...data }, [
      'bestellingIds',
    ]);
    return NextResponse.json(created, { status: 201 });
  }
);
