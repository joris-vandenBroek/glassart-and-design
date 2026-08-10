import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getRow, insertRow, parseJsonKolom } from '@/lib/server/crud';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

export const GET = withMedewerker<Context>(
  'GET /api/drukkers/[id]/zendingen',
  async (_request, { params }) => {
    const [rows] = await getPool().query(
      `SELECT z.* FROM drukkerZendingen z
       JOIN drukkers d ON d.drukkernr = z.drukkernr
       WHERE d.id = ?
       ORDER BY z.verzondenOp DESC`,
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
    // Het nummer wordt hier opgezocht in plaats van uit de body gehaald: een client kan
    // zo geen zending onder een andere drukker hangen. Een onbekende drukker levert een
    // nette 404 op in plaats van een onafgevangen foreign-key-fout.
    const drukker = await getRow<{ drukkernr: string }>('drukkers', params.id);
    if (!drukker) return NextResponse.json({ error: 'drukker-not-found' }, { status: 404 });
    const data = await request.json();
    const created = await insertRow('drukkerZendingen', { drukkernr: drukker.drukkernr, ...data }, [
      'bestellingIds',
    ]);
    return NextResponse.json(created, { status: 201 });
  }
);
