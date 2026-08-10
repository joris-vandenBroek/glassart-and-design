import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { destroySessionsForUser } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { genereerWachtwoord } from '@/lib/server/genereerWachtwoord';
import { actorUitSessie, schrijfActiviteit } from '@/lib/server/activiteitActor';

/**
 * Geeft een nieuw wachtwoord uit voor een klant die de beheerder aan de telefoon
 * heeft. Bewust een eigen route en niet `PATCH /api/klanten/[id]`: dat is de
 * generieke veldbewerking, terwijl dit een handeling met eigen neveneffecten is.
 *
 * Het wachtwoord ontstaat hier, op de server, en gaat één keer over de lijn --
 * terug naar de beheerder. Er staat daarna alleen nog een hash; opnieuw opvragen
 * kan niet.
 */
export const POST = withApiErrorHandling(
  'POST /api/klanten/[id]/wachtwoord',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const [rows] = await getPool().query('SELECT companyName, email FROM klanten WHERE id = ?', [
      params.id,
    ]);
    const klant = (rows as Array<{ companyName: string | null; email: string | null }>)[0];
    if (!klant) {
      return NextResponse.json({ error: 'klant-niet-gevonden' }, { status: 404 });
    }

    const wachtwoord = genereerWachtwoord();
    // Hashen en de actor opzoeken gebeuren buiten de transactie: allebei traag
    // genoeg (scrypt, twee queries) om de rijen anders onnodig lang te vergrendelen.
    const hash = await hashPassword(wachtwoord);
    const actor = await actorUitSessie(request);

    // Alle vier de mutaties in één transactie. Zonder dat kon een fout ná de
    // eerste stap een klant achterlaten met een hash waarvan niemand het
    // wachtwoord kent: de beheerder ziet een foutmelding, het wachtwoord staat
    // alleen nog in een request die aan het afbreken is, en de klant komt met
    // geen van beide wachtwoorden meer binnen.
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE klanten SET wachtwoordHash = ? WHERE id = ?', [hash, params.id]);

      // Een eerder gemailde resetlink blijft anders 24 uur geldig náást het zojuist
      // uitgegeven wachtwoord.
      await connection.query(
        "DELETE FROM passwordResetTokens WHERE userType = 'klant' AND userId = ?",
        [params.id]
      );
      // En wie nog ergens ingelogd stond met het oude wachtwoord, ligt eruit.
      await destroySessionsForUser('klant', params.id, connection);

      // Server-side geschreven, niet via logActiviteit() uit de browser: dat is
      // fire-and-forget, en dit is de ene beheerhandeling waarvan de logregel niet
      // geruisloos mag wegvallen. Het wachtwoord zelf staat er nooit in.
      await schrijfActiviteit(
        'klant_wachtwoord_uitgegeven',
        `${klant.companyName || 'Onbekend'} (${klant.email ?? 'geen e-mailadres'})`,
        actor,
        connection
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    // Pas ná de commit: het wachtwoord gaat alleen de deur uit als het ook echt vaststaat.
    return NextResponse.json({ wachtwoord });
  }
);
