import { NextResponse } from 'next/server';
import { insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { ACTIVITEIT_TYPES, ONBEKENDE_ACTOR, type ActiviteitActor } from '@/lib/logActiviteit';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { sessionIdFromRequest, validateSession } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

/**
 * Wie de actie deed, afgeleid uit de sessiecookie -- niet uit de request-body.
 *
 * De client stuurde actorId/actorEmail/actorNaam vroeger zelf mee. Omdat deze
 * route bewust open staat (ook anonieme bezoekers loggen hier), kon iedereen
 * daarmee een willekeurige gebeurtenis op naam van een willekeurige medewerker
 * in het logboek zetten -- wat precies de waarde van een auditlog wegneemt.
 */
async function actorUitSessie(request: Request): Promise<ActiviteitActor> {
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return ONBEKENDE_ACTOR;
  const session = await validateSession(sessionId);
  if (!session) return ONBEKENDE_ACTOR;

  if (session.userType === 'medewerker') {
    const [rows] = await getPool().query('SELECT email, naam FROM medewerkers WHERE id = ?', [
      session.userId,
    ]);
    const medewerker = (rows as Array<{ email: string | null; naam: string | null }>)[0];
    if (!medewerker) return ONBEKENDE_ACTOR;
    const email = medewerker.email ?? 'Onbekend';
    return { id: session.userId, email, naam: medewerker.naam || email };
  }

  const [rows] = await getPool().query(
    'SELECT email, companyName, contactPerson FROM klanten WHERE id = ?',
    [session.userId]
  );
  const klant = (rows as Array<{
    email: string | null;
    companyName: string | null;
    contactPerson: string | null;
  }>)[0];
  if (!klant) return ONBEKENDE_ACTOR;
  return {
    id: session.userId,
    email: klant.email ?? 'Onbekend',
    naam: klant.companyName || klant.contactPerson || 'Onbekend',
  };
}

// Deliberately open -- both anonymous visitors (e.g. word_klant_bezocht) and logged-in
// customers/staff log their own events here, so this can't require a medewerker session.
export const POST = withApiErrorHandling('POST /api/activiteitenlog', async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown>;
  if (typeof body?.type !== 'string' || !ACTIVITEIT_TYPES.includes(body.type as never)) {
    return NextResponse.json({ error: 'invalid-type' }, { status: 400 });
  }

  // Het record wordt hier veld voor veld opgebouwd in plaats van de body door te
  // geven aan `insertRow`. De sleutels van die body werden namelijk kolomnamen in
  // de INSERT, en deze route staat open voor iedereen.
  const actor = await actorUitSessie(request);
  await insertRow('activiteitenlog', {
    type: body.type,
    actorId: actor.id,
    actorEmail: actor.email,
    actorNaam: actor.naam,
    omschrijving: typeof body.omschrijving === 'string' ? body.omschrijving : null,
  } as never);
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
