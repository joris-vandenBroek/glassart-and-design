import type { Bestelling, BestellingLine } from '@/components/beheer/BestellingenSection';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';

export interface DrukkerMailInput {
  bestellingen: Bestelling[];
  klanten: Klant[];
  kunstwerken: Kunstwerk[];
  materialen: Materiaal[];
  maten: Maat[];
  materiaalsoorten: Materiaalsoort[];
}

export interface DrukkerMail {
  subject: string;
  body: string;
}

function formatAfleveradres(klant: Klant): string {
  const heeftAfleveradres = klant.deliveryAddress.trim() !== '';
  const adres = heeftAfleveradres ? klant.deliveryAddress : klant.address;
  const postcode = heeftAfleveradres ? klant.deliveryPostcode : klant.postcode;
  const plaats = heeftAfleveradres ? klant.deliveryCity : klant.city;
  return `${adres}, ${postcode} ${plaats}`;
}

function formaatSuffix(kunstwerk: Kunstwerk | undefined): string {
  if (kunstwerk?.formaat === 'liggend') return ' (Liggend)';
  if (kunstwerk?.formaat === 'staand') return ' (Staand)';
  return '';
}

function formatRegel(
  line: BestellingLine,
  kunstwerken: Kunstwerk[],
  materialen: Materiaal[],
  maten: Maat[],
  materiaalsoorten: Materiaalsoort[]
): string {
  const kunstwerk = kunstwerken.find((k) => k.id === line.kunstwerkId);
  const materiaal = materialen.find((m) => m.id === line.materiaalId);
  const materiaalsoort = materiaal ? materiaalsoorten.find((s) => s.id === materiaal.materiaalsoortId) : undefined;
  const maat = maten.find((m) => m.id === line.maatId);

  const naam = kunstwerk?.omschrijvingNl ?? 'Onbekend kunstwerk';
  const materiaalOmschrijving = materiaal
    ? `${materiaal.materiaaldikte}mm ${materiaalsoort?.omschrijving ?? materiaal.materiaalsoortId} — ${materiaal.omschrijving}`
    : 'Onbekend materiaal';
  const maatOmschrijving = maat
    ? `${maat.breedte}×${maat.hoogte} cm${formaatSuffix(kunstwerk)}`
    : line.breedte != null && line.hoogte != null
      ? `${line.breedte}×${line.hoogte} cm${formaatSuffix(kunstwerk)}`
      : 'Onbekende maat';

  return `${naam} — ${materiaalOmschrijving}, maat ${maatOmschrijving}, aantal ${line.quantity}`;
}

export function buildDrukkerMail({
  bestellingen,
  klanten,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
}: DrukkerMailInput): DrukkerMail {
  const datum = new Date().toLocaleDateString('nl-NL');
  const klantIds = Array.from(new Set(bestellingen.map((b) => b.klantId)));

  const secties = klantIds.map((klantId) => {
    const klant = klanten.find((k) => k.id === klantId);
    const klantBestellingen = bestellingen.filter((b) => b.klantId === klantId);
    const bedrijfsnaam = klant?.companyName ?? klantBestellingen[0].companyName;
    const afleveradres = klant ? formatAfleveradres(klant) : 'Onbekend afleveradres';
    const regels = klantBestellingen
      .flatMap((b) => b.lines)
      .map((line) => `- ${formatRegel(line, kunstwerken, materialen, maten, materiaalsoorten)}`)
      .join('\n');
    return `== ${bedrijfsnaam} ==\nAfleveradres: ${afleveradres}\n${regels}`;
  });

  return {
    subject: `Nieuwe order(s) voor de drukker – ${datum}`,
    body: secties.join('\n\n'),
  };
}
