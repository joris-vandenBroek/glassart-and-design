import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';
import { berekenPrijzenVoorAlleKunstwerken, berekenPrijzenVoorCombinaties } from '@/lib/server/prijsmodule';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling('GET /api/kunstwerken/prijzen', async (request: Request) => {
  const url = new URL(request.url);
  const materiaalIdsParam = url.searchParams.get('materiaalIds');
  const maatIdsParam = url.searchParams.get('maatIds');

  if (materiaalIdsParam !== null || maatIdsParam !== null) {
    // Ad-hoc mode is staff-only: it echoes back a raw matrixprijs + kunstenaar prijsopslag
    // for an arbitrary kunstenaarId param, so calling it twice (with/without kunstenaarId)
    // and subtracting would reveal that kunstenaar's exact prijsopslag -- the same
    // confidentiality tier as prijsafspraken. Bulk mode (no params) stays public since it
    // only ever returns final combined customer-facing prices, never a raw opslag.
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const kunstenaarId = url.searchParams.get('kunstenaarId') || null;
    const materiaalIds = materiaalIdsParam ? materiaalIdsParam.split(',') : [];
    const maatIds = maatIdsParam ? maatIdsParam.split(',') : [];
    const prijzen = await berekenPrijzenVoorCombinaties(getPool(), kunstenaarId, materiaalIds, maatIds);
    return NextResponse.json({ prijzen });
  }

  // Bulk mode stays public (no login required), but an ingelogde klant's own prijsgroep
  // korting/opslag is applied on top of the base price when a valid klant session is present.
  const klantId = await requireKlant(request);
  const prijzenPerKunstwerk = await berekenPrijzenVoorAlleKunstwerken(getPool(), klantId);
  return NextResponse.json(prijzenPerKunstwerk);
});
