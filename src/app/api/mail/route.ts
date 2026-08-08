import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { verstuurMail } from '@/lib/server/mailRelay';

/**
 * Server-side proxy voor de PHP-mailrelay.
 *
 * De client stuurde het gedeelde relay-secret vroeger zélf mee, wat betekende
 * dat het secret in de publieke JS-bundle stond en iedereen de relay kon
 * gebruiken om willekeurige post te versturen namens ons domein. Het secret
 * leeft nu alleen nog server-side (zie `mailRelay.ts`).
 *
 * Het belangrijkste verschil met "gewoon het secret verplaatsen": de
 * **ontvanger** komt hier nooit uit de request. Per soort bericht bepaalt de
 * server naar wie het gaat -- de eigen klant, of het bij `drukkerId` bekende
 * e-mailadres. Onderwerp en tekst mogen wél van de client komen: die zijn
 * vertaald (next-intl) en zonder ontvanger valt er niets mee te misbruiken.
 */
type MailVerzoek =
  | { soort: 'bestelbevestiging'; subject: string; body: string }
  | { soort: 'drukker'; drukkerId: string; subject: string; body: string; html?: string };

function isNietLegeString(waarde: unknown): waarde is string {
  return typeof waarde === 'string' && waarde.trim() !== '';
}

export const POST = withApiErrorHandling('POST /api/mail', async (request: Request) => {
  const verzoek = (await request.json()) as Partial<MailVerzoek>;

  if (!isNietLegeString(verzoek.subject) || !isNietLegeString(verzoek.body)) {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
  }

  if (verzoek.soort === 'bestelbevestiging') {
    const klantId = await requireKlant(request);
    if (!klantId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const [rows] = await getPool().query('SELECT email FROM klanten WHERE id = ?', [klantId]);
    const email = (rows as Array<{ email: string | null }>)[0]?.email;
    if (!isNietLegeString(email)) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const verzonden = await verstuurMail({ to: email, subject: verzoek.subject, body: verzoek.body });
    return verzonden
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'mail-mislukt' }, { status: 502 });
  }

  if (verzoek.soort === 'drukker') {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isNietLegeString(verzoek.drukkerId)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
    const [rows] = await getPool().query('SELECT email FROM drukkers WHERE id = ?', [verzoek.drukkerId]);
    const email = (rows as Array<{ email: string | null }>)[0]?.email;
    if (!isNietLegeString(email)) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const verzonden = await verstuurMail({
      to: email,
      subject: verzoek.subject,
      body: verzoek.body,
      ...(isNietLegeString(verzoek.html) ? { html: verzoek.html } : {}),
    });
    return verzonden
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'mail-mislukt' }, { status: 502 });
  }

  return NextResponse.json({ error: 'onbekende-soort' }, { status: 400 });
});
