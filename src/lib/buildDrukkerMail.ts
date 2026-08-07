import type { Bestelling, BestellingLine } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Bedrijfsgegevens } from '@/components/beheer/bedrijfsgegevensTypes';

export interface DrukkerMailInput {
  bestellingen: Bestelling[];
  klanten: Klant[];
  kunstwerken: Kunstwerk[];
  materialen: Materiaal[];
  maten: Maat[];
  materiaalsoorten: Materiaalsoort[];
  bedrijfsgegevens: Bedrijfsgegevens;
}

export interface DrukkerMail {
  subject: string;
  text: string;
  html: string;
}

/**
 * De velden die het factuurvoetje nodig heeft. Los benoemd omdat de aanroeper
 * hierop moet kunnen controleren vóórdat er een mail de deur uit gaat: een
 * factuurvoetje zonder KVK- of btw-nummer hoort niet bij een drukker aan te
 * komen.
 */
const FACTUURVOETJE_VELDEN = ['bezoekadres', 'kvkNummer', 'btwNummer', 'email'] as const;

/**
 * Bewust smal getypeerd: de aanroeper zet dit om in de vertaalsleutel
 * `bedrijfsgegevensVeld_${veld}`. Zou dit `string` zijn, dan levert een later
 * toegevoegd veld zonder vertaling stilzwijgend de ruwe sleutelnaam in beeld
 * in plaats van een compilerfout.
 */
export type FactuurvoetjeVeld = (typeof FACTUURVOETJE_VELDEN)[number];

/**
 * Zelfde reden als bij FactuurvoetjeVeld: de aanroeper zet dit om in de
 * vertaalsleutel `klantVeld_${veld}`, dus een nieuw veld zonder vertaling
 * hoort een compilerfout te geven in plaats van een ruwe sleutel in beeld.
 */
export type KlantVeld =
  | 'companyName'
  | 'address'
  | 'postcode'
  | 'city'
  | 'deliveryAddress'
  | 'deliveryPostcode'
  | 'deliveryCity';

/**
 * Geeft de factuurvoetje-velden terug die ontbreken of leeg zijn.
 *
 * `Bedrijfsgegevens` belooft in TypeScript tien verplichte strings, maar de
 * data komt als losse JSON-blob uit de `instellingen`-tabel en wordt nergens
 * gevalideerd -- een ontbrekend veld is op runtime dus gewoon `undefined`.
 *
 * Een afwezig record levert een lege lijst op: er valt dan niets te melden
 * over losse velden. Let op dat dit iets anders is dan "alles in orde" -- de
 * aanroeper moet het ontbreken van het record zelf afvangen. `useApiRecord`
 * mapt een 404 op `data: null, error: null`, dus dat geval is met een
 * error-check alleen niet te onderscheiden.
 */
export function ontbrekendeFactuurvoetjeVelden(
  bedrijfsgegevens: Bedrijfsgegevens | null | undefined
): FactuurvoetjeVeld[] {
  if (!bedrijfsgegevens) {
    return [];
  }
  return FACTUURVOETJE_VELDEN.filter((veld) => {
    const waarde = bedrijfsgegevens[veld];
    return typeof waarde !== 'string' || waarde.trim() === '';
  });
}

// Neemt `unknown` in plaats van `string`: het type van de bedrijfsgegevens
// garandeert niets over de werkelijke inhoud (zie hierboven), en deze functie
// draait tijdens een render van een component dat altijd gemount is. Zou hij
// gooien op een ontbrekend veld, dan sloopt dat het hele bestellingenscherm en
// niet alleen de dialoog -- dat is precies wat er ooit gebeurde.
function escapeHtml(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Zelfde reden als bij escapeHtml: een ontbrekend veld mag geen letterlijke
// "undefined" in de mail zetten.
function tekst(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildFactuurvoetjeText(bedrijfsgegevens: Bedrijfsgegevens): string {
  return `--\nGlassart & Design\n${tekst(bedrijfsgegevens.bezoekadres)}\nKVK-nummer: ${tekst(bedrijfsgegevens.kvkNummer)}\nBtw-nummer: ${tekst(bedrijfsgegevens.btwNummer)}\nE-mailadres (voor facturen): ${tekst(bedrijfsgegevens.email)}`;
}

function buildFactuurvoetjeHtml(bedrijfsgegevens: Bedrijfsgegevens): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;border-top:1px solid #e5e5e5;">
  <tr>
    <td style="padding-top:12px;font-family:Arial,sans-serif;font-size:12px;color:#666666;">
      <div style="font-weight:bold;color:#333333;margin-bottom:2px;">Glassart &amp; Design</div>
      <div>${escapeHtml(bedrijfsgegevens.bezoekadres)}</div>
      <div>KVK-nummer: ${escapeHtml(bedrijfsgegevens.kvkNummer)}</div>
      <div>Btw-nummer: ${escapeHtml(bedrijfsgegevens.btwNummer)}</div>
      <div>E-mailadres (voor facturen): ${escapeHtml(bedrijfsgegevens.email)}</div>
    </td>
  </tr>
</table>`;
}

/**
 * Bepaalt of de klant een apart afleveradres heeft. Zo ja, dan gelden de
 * delivery-velden; zo nee, dan het hoofdadres. Deze keuze bepaalt zowel wat er
 * in de mail komt als welke velden verplicht zijn -- daarom staat hij hier één
 * keer, zodat `formatAfleveradres` en `ontbrekendeKlantVelden` niet uit elkaar
 * kunnen lopen.
 */
function gebruiktAfleveradres(klant: Klant): boolean {
  return typeof klant.deliveryAddress === 'string' && klant.deliveryAddress.trim() !== '';
}

/**
 * De klantvelden die de drukkersmail nodig heeft: een bedrijfsnaam om de
 * sectie mee te labelen, plus een compleet bezorgadres.
 *
 * Net als bij de bedrijfsgegevens liegt het type hier over runtime:
 * `companyName`, `address`, `postcode`, `city` en de delivery-varianten zijn
 * in `db/schema.sql` NULLABLE, terwijl `Klant` ze als verplichte `string`
 * typeert. Een afwezig klantrecord levert een lege lijst op -- dat geval hoort
 * de aanroeper apart af te vangen, want dan valt er over losse velden niets te
 * zeggen.
 */
export function ontbrekendeKlantVelden(klant: Klant | null | undefined): KlantVeld[] {
  if (!klant) {
    return [];
  }
  const adresVelden: KlantVeld[] = gebruiktAfleveradres(klant)
    ? ['deliveryAddress', 'deliveryPostcode', 'deliveryCity']
    : ['address', 'postcode', 'city'];
  return (['companyName', ...adresVelden] as KlantVeld[]).filter((veld) => {
    const waarde = klant[veld];
    return typeof waarde !== 'string' || waarde.trim() === '';
  });
}

function formatAfleveradres(klant: Klant): string {
  const heeftAfleveradres = gebruiktAfleveradres(klant);
  const adres = tekst(heeftAfleveradres ? klant.deliveryAddress : klant.address);
  const postcode = tekst(heeftAfleveradres ? klant.deliveryPostcode : klant.postcode);
  const plaats = tekst(heeftAfleveradres ? klant.deliveryCity : klant.city);
  return `${adres}, ${postcode} ${plaats}`;
}

function formaatSuffix(kunstwerk: Kunstwerk | undefined): string {
  if (kunstwerk?.formaat === 'liggend') return ' (Liggend)';
  if (kunstwerk?.formaat === 'staand') return ' (Staand)';
  return '';
}

interface ResolvedRegel {
  kunstwerk: Kunstwerk | undefined;
  naam: string;
  materiaalOmschrijving: string;
  maatOmschrijving: string;
}

function resolveRegel(
  line: BestellingLine,
  kunstwerken: Kunstwerk[],
  materialen: Materiaal[],
  maten: Maat[],
  materiaalsoorten: Materiaalsoort[]
): ResolvedRegel {
  const kunstwerk = kunstwerken.find((k) => k.id === line.kunstwerkId);
  const materiaal = materialen.find((m) => m.id === line.materiaalId);
  const materiaalsoort = materiaal ? materiaalsoorten.find((s) => s.id === materiaal.materiaalsoortId) : undefined;
  const maat = maten.find((m) => m.id === line.maatId);

  const naam = kunstwerk?.naam || 'Onbekend kunstwerk';
  const materiaalOmschrijving = materiaal
    ? `${materiaal.materiaaldikte}mm ${materiaalsoort?.omschrijving ?? materiaal.materiaalsoortId} — ${materiaal.omschrijving}`
    : 'Onbekend materiaal';
  const maatOmschrijving = maat
    ? `${maat.breedte}×${maat.hoogte} cm${formaatSuffix(kunstwerk)}`
    : line.breedte != null && line.hoogte != null
      ? `${line.breedte}×${line.hoogte} cm${formaatSuffix(kunstwerk)}`
      : 'Onbekende maat';

  return { kunstwerk, naam, materiaalOmschrijving, maatOmschrijving };
}

function formatRegel(
  line: BestellingLine,
  kunstwerken: Kunstwerk[],
  materialen: Materiaal[],
  maten: Maat[],
  materiaalsoorten: Materiaalsoort[]
): string {
  const { naam, materiaalOmschrijving, maatOmschrijving } = resolveRegel(
    line,
    kunstwerken,
    materialen,
    maten,
    materiaalsoorten
  );

  return `${naam} — ${materiaalOmschrijving}, maat ${maatOmschrijving}, aantal ${line.quantity}`;
}

function formatRegelHtml(
  line: BestellingLine,
  kunstwerken: Kunstwerk[],
  materialen: Materiaal[],
  maten: Maat[],
  materiaalsoorten: Materiaalsoort[]
): string {
  const { kunstwerk, naam, materiaalOmschrijving, maatOmschrijving } = resolveRegel(
    line,
    kunstwerken,
    materialen,
    maten,
    materiaalsoorten
  );

  const thumbnail = kunstwerk?.foto
    ? `<img src="${escapeHtml(kunstwerk.foto)}" width="64" height="64" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:4px;display:block;" />`
    : `<div style="width:64px;height:64px;border-radius:4px;background:#f2f2f2;color:#999999;text-align:center;line-height:64px;font-family:Arial,sans-serif;font-size:20px;border:1px solid #e5e5e5;">?</div>`;

  return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="64" style="vertical-align:top;padding-right:12px;">${thumbnail}</td>
        <td style="vertical-align:top;font-family:Arial,sans-serif;font-size:13px;color:#333333;">
          <div style="font-weight:bold;margin-bottom:2px;">${escapeHtml(naam)}</div>
          <div style="color:#666666;">${escapeHtml(materiaalOmschrijving)}</div>
          <div style="color:#666666;">Maat: ${escapeHtml(maatOmschrijving)} &middot; Aantal: ${line.quantity}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

export function buildDrukkerMail({
  bestellingen,
  klanten,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  bedrijfsgegevens,
}: DrukkerMailInput): DrukkerMail {
  const datum = new Date().toLocaleDateString('nl-NL');
  const klantIds = Array.from(new Set(bestellingen.map((b) => b.klantId)));

  const secties = klantIds.map((klantId) => {
    const klant = klanten.find((k) => k.id === klantId);
    const klantBestellingen = bestellingen.filter((b) => b.klantId === klantId);
    // `??` vangt alleen null/undefined, niet een lege string uit de database --
    // vandaar tekst() plus een expliciete terugval op de naam die bij de
    // bestelling zelf is vastgelegd.
    const bedrijfsnaam = tekst(klant?.companyName) || tekst(klantBestellingen[0].companyName);
    const afleveradres = klant ? formatAfleveradres(klant) : 'Onbekend afleveradres';

    const bestellingBlokkenText = klantBestellingen
      .map((bestelling) => {
        const regelsText = bestelling.lines
          .map((line) => `- ${formatRegel(line, kunstwerken, materialen, maten, materiaalsoorten)}`)
          .join('\n');
        return `Bestelling ${bestelling.bestelnr}:\n${regelsText}`;
      })
      .join('\n\n');

    const bestellingBlokkenHtml = klantBestellingen
      .map((bestelling) => {
        const regelsHtml = bestelling.lines
          .map((line) => formatRegelHtml(line, kunstwerken, materialen, maten, materiaalsoorten))
          .join('');
        return `<tr>
  <td style="padding:12px 0 4px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#333333;">Bestelling ${escapeHtml(bestelling.bestelnr)}</td>
</tr>
${regelsHtml}`;
      })
      .join('');

    return {
      text: `== ${bedrijfsnaam} ==\nAfleveradres: ${afleveradres}\n\n${bestellingBlokkenText}`,
      html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
  <tr>
    <td style="background:#f2f2f2;padding:12px 16px;border-radius:4px 4px 0 0;">
      <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#111111;">${escapeHtml(bedrijfsnaam)}</div>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:#555555;margin-top:2px;">Afleveradres: ${escapeHtml(afleveradres)}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${bestellingBlokkenHtml}
      </table>
    </td>
  </tr>
</table>`,
    };
  });

  return {
    subject: `Nieuwe order(s) voor de drukker – ${datum}`,
    text: `${secties.map((sectie) => sectie.text).join('\n\n')}\n\n${buildFactuurvoetjeText(bedrijfsgegevens)}`,
    html: `<html><body style="margin:0;padding:16px;background:#ffffff;">${secties.map((sectie) => sectie.html).join('')}${buildFactuurvoetjeHtml(bedrijfsgegevens)}</body></html>`,
  };
}
