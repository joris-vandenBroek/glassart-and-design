import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { redigeerExclusieveKlantIds } from '@/lib/server/kunstenaarZichtbaarheid';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

const KUNSTENAARS_JSON_COLUMNS = ['exclusieveKlantIds'];

// Publiek leesbaar: de collectiepagina toont kunstenaars aan iedereen. De
// exclusiviteitslijst wordt voor niet-medewerkers geredigeerd.
export const GET = withApiErrorHandling('GET /api/kunstenaars', async (request: Request) => {
  const isMedewerker = (await requireMedewerker(request)) !== null;
  const rows = await listRows<{ exclusieveKlantIds?: string[] }>(
    'kunstenaars',
    KUNSTENAARS_JSON_COLUMNS
  );
  if (isMedewerker) {
    return NextResponse.json(rows);
  }
  const klantId = await requireKlant(request);
  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      exclusieveKlantIds: redigeerExclusieveKlantIds(row.exclusieveKlantIds, klantId),
    }))
  );
});

export const POST = withApiErrorHandling('POST /api/kunstenaars', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const data = await request.json();
  const created = await insertRow('kunstenaars', data, KUNSTENAARS_JSON_COLUMNS);
  return NextResponse.json(created, { status: 201 });
});
