import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { redigeerExclusieveKlantIds } from '@/lib/server/kunstenaarZichtbaarheid';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { getPool } from '@/lib/server/db';
import { volgendNummer } from '@/lib/server/counters';

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
  // Het nummer is server-eigendom: een kunstenaarnr uit de body wordt weggegooid.
  // Dat is wat de foreign keys uit deel 2 stabiel houdt -- er is geen pad waarlangs
  // een nummer kan verschuiven onder bestaande verwijzingen.
  const { kunstenaarnr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // Ophogen en invoegen in dezelfde transactie, anders zien twee gelijktijdige
    // aanmaakverzoeken hetzelfde nummer.
    const kunstenaarnr = await volgendNummer(connection, 'kunstenaarnummer', 'KU-');
    const created = await insertRow(
      'kunstenaars',
      { ...data, kunstenaarnr },
      KUNSTENAARS_JSON_COLUMNS,
      connection
    );
    await connection.commit();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
