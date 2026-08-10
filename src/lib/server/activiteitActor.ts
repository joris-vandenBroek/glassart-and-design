import { insertRow } from './crud';
import { getPool } from './db';
import { ONBEKENDE_ACTOR, type ActiviteitActor, type ActiviteitType } from '@/lib/logActiviteit';
import { sessionIdFromRequest, validateSession } from './session';

/**
 * Wie de actie deed, afgeleid uit de sessiecookie -- niet uit de request-body.
 *
 * De client stuurde actorId/actorEmail/actorNaam vroeger zelf mee. Omdat de
 * activiteitenlog-route bewust open staat (ook anonieme bezoekers loggen daar),
 * kon iedereen daarmee een willekeurige gebeurtenis op naam van een willekeurige
 * medewerker in het logboek zetten -- wat precies de waarde van een auditlog
 * wegneemt.
 */
export async function actorUitSessie(request: Request): Promise<ActiviteitActor> {
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

/**
 * Schrijft één regel in het activiteitenlog. Het record wordt veld voor veld
 * opgebouwd in plaats van een doorgegeven object: de sleutels van zo'n object
 * worden kolomnamen in de INSERT, en de aanroepende route staat open voor
 * iedereen.
 */
export async function schrijfActiviteit(
  type: ActiviteitType,
  omschrijving: string | null,
  actor: ActiviteitActor
): Promise<void> {
  await insertRow('activiteitenlog', {
    type,
    actorId: actor.id,
    actorEmail: actor.email,
    actorNaam: actor.naam,
    omschrijving,
  } as never);
}
