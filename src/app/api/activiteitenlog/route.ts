import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { ACTIVITEIT_TYPES, type ActiviteitType } from '@/lib/logActiviteit';
import { actorUitSessie, schrijfActiviteit } from '@/lib/server/activiteitActor';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

// Deliberately open -- both anonymous visitors (e.g. word_klant_bezocht) and logged-in
// customers/staff log their own events here, so this can't require a medewerker session.
export const POST = withApiErrorHandling('POST /api/activiteitenlog', async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown>;
  if (typeof body?.type !== 'string' || !ACTIVITEIT_TYPES.includes(body.type as never)) {
    return NextResponse.json({ error: 'invalid-type' }, { status: 400 });
  }

  await schrijfActiviteit(
    body.type as ActiviteitType,
    typeof body.omschrijving === 'string' ? body.omschrijving : null,
    await actorUitSessie(request)
  );
  return NextResponse.json({ ok: true }, { status: 201 });
});

// The log records real actorEmail/actorNaam for every customer and staff action --
// reading it back is a staff-only audit view.
export const GET = withApiErrorHandling('GET /api/activiteitenlog', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT * FROM activiteitenlog ORDER BY timestamp DESC LIMIT 500'
  );
  return NextResponse.json(rows);
});
