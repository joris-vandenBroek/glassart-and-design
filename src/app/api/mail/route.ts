import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { verstuurMail } from '@/lib/server/mailRelay';
import { parseJsonKolom } from '@/lib/server/crud';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import { formatCurrency } from '@/lib/formatCurrency';

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
  | { soort: 'drukker'; drukkerId: string; subject: string; body: string; html?: string }
  | { soort: 'bestelwijziging'; bestelheaderId: string };

function isNietLegeString(waarde: unknown): waarde is string {
  return typeof waarde === 'string' && waarde.trim() !== '';
}

interface BestellijnRij {
  code: string;
  prijs: number | null;
  quantity: number;
}

function bouwWijzigingsmailHtml(bestelnr: string, lines: BestellijnRij[], totalen: ReturnType<typeof berekenBestellingTotalen>): string {
  const regelsHtml = lines
    .map(
      (line) =>
        `<tr><td>${line.code}</td><td>${line.quantity}</td><td>${
          line.prijs != null ? formatCurrency(line.prijs) : 'op aanvraag'
        }</td><td>${line.prijs != null ? formatCurrency(line.prijs * line.quantity) : ''}</td></tr>`
    )
    .join('');
  const kortingRegel =
    totalen.korting > 0 ? `<p>Korting: ${formatCurrency(totalen.korting)}</p>` : '';
  const totaalRegel =
    totalen.totaalExclBtw != null
      ? `<p>Totaal excl. btw: ${formatCurrency(totalen.totaalExclBtw)}</p>`
      : '<p>Totaal: wordt nog vastgesteld</p>';
  const btwRegel =
    totalen.btwBedrag != null && totalen.totaalInclBtw != null
      ? `<p>Btw (${totalen.btwPercentage}%): ${formatCurrency(totalen.btwBedrag)}</p><p>Totaal incl. btw: ${formatCurrency(totalen.totaalInclBtw)}</p>`
      : '';
  return `<h1>Bestelling ${bestelnr} is gewijzigd</h1><table><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs</th><th>Regeltotaal</th></tr></thead><tbody>${regelsHtml}</tbody></table>${kortingRegel}${totaalRegel}${btwRegel}`;
}

export const POST = withApiErrorHandling('POST /api/mail', async (request: Request) => {
  const verzoek = (await request.json()) as Partial<MailVerzoek>;

  if (verzoek.soort === 'bestelbevestiging') {
    if (!isNietLegeString(verzoek.subject) || !isNietLegeString(verzoek.body)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
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
    if (!isNietLegeString(verzoek.subject) || !isNietLegeString(verzoek.body)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
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

  if (verzoek.soort === 'bestelwijziging') {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isNietLegeString(verzoek.bestelheaderId)) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }
    const pool = getPool();
    const [headerRows] = await pool.query('SELECT bestelnr, klantnr, korting FROM bestelheaders WHERE id = ?', [
      verzoek.bestelheaderId,
    ]);
    const header = (headerRows as Array<{ bestelnr: string; klantnr: string; korting: number | null }>)[0];
    if (!header) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const [klantRows] = await pool.query('SELECT email, land, invoiceLand FROM klanten WHERE klantnr = ?', [
      header.klantnr,
    ]);
    const klant = (klantRows as Array<{ email: string | null; land: string | null; invoiceLand: string | null }>)[0];
    if (!klant || !isNietLegeString(klant.email)) {
      return NextResponse.json({ error: 'geen-ontvanger' }, { status: 400 });
    }
    const [instellingenRows] = await pool.query("SELECT data FROM instellingen WHERE id = 'btwtarieven'");
    const instellingenRow = (instellingenRows as Array<{ data: string | object }>)[0];
    const btwData = instellingenRow ? parseJsonKolom<{ tarieven?: Array<{ land: string; percentage: number }> }>(instellingenRow.data, {}) : {};
    const btwPercentage = resolveBtwPercentage(btwData.tarieven ?? [], klant.invoiceLand || klant.land || null);

    const [lineRows] = await pool.query('SELECT code, prijs, quantity FROM bestellines WHERE bestelnr = ?', [
      header.bestelnr,
    ]);
    const lines = lineRows as BestellijnRij[];
    const totalen = berekenBestellingTotalen(lines, header.korting, btwPercentage);

    const subject = `Bestelling ${header.bestelnr} is gewijzigd`;
    const html = bouwWijzigingsmailHtml(header.bestelnr, lines, totalen);
    const verzonden = await verstuurMail({ to: klant.email, subject, body: subject, html });
    return verzonden
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'mail-mislukt' }, { status: 502 });
  }

  return NextResponse.json({ error: 'onbekende-soort' }, { status: 400 });
});
