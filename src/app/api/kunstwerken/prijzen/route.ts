import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { berekenPrijzenVoorAlleKunstwerken, berekenPrijzenVoorCombinaties } from '@/lib/server/prijsmodule';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling('GET /api/kunstwerken/prijzen', async (request: Request) => {
  const url = new URL(request.url);
  const materiaalIdsParam = url.searchParams.get('materiaalIds');
  const maatIdsParam = url.searchParams.get('maatIds');

  if (materiaalIdsParam !== null && maatIdsParam !== null) {
    const kunstenaarId = url.searchParams.get('kunstenaarId') || null;
    const materiaalIds = materiaalIdsParam ? materiaalIdsParam.split(',') : [];
    const maatIds = maatIdsParam ? maatIdsParam.split(',') : [];
    const prijzen = await berekenPrijzenVoorCombinaties(getPool(), kunstenaarId, materiaalIds, maatIds);
    return NextResponse.json({ prijzen });
  }

  const prijzenPerKunstwerk = await berekenPrijzenVoorAlleKunstwerken(getPool());
  return NextResponse.json(prijzenPerKunstwerk);
});
