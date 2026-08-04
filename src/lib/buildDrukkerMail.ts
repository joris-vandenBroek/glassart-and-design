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
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAfleveradres(klant: Klant): string {
  const heeftAfleveradres = !!klant.deliveryAddress?.trim();
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
}: DrukkerMailInput): DrukkerMail {
  const datum = new Date().toLocaleDateString('nl-NL');
  const klantIds = Array.from(new Set(bestellingen.map((b) => b.klantId)));

  const secties = klantIds.map((klantId) => {
    const klant = klanten.find((k) => k.id === klantId);
    const klantBestellingen = bestellingen.filter((b) => b.klantId === klantId);
    const bedrijfsnaam = klant?.companyName ?? klantBestellingen[0].companyName;
    const afleveradres = klant ? formatAfleveradres(klant) : 'Onbekend afleveradres';
    const lines = klantBestellingen.flatMap((b) => b.lines);

    const regelsText = lines
      .map((line) => `- ${formatRegel(line, kunstwerken, materialen, maten, materiaalsoorten)}`)
      .join('\n');
    const regelsHtml = lines
      .map((line) => formatRegelHtml(line, kunstwerken, materialen, maten, materiaalsoorten))
      .join('');

    return {
      text: `== ${bedrijfsnaam} ==\nAfleveradres: ${afleveradres}\n${regelsText}`,
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
        ${regelsHtml}
      </table>
    </td>
  </tr>
</table>`,
    };
  });

  return {
    subject: `Nieuwe order(s) voor de drukker – ${datum}`,
    text: secties.map((sectie) => sectie.text).join('\n\n'),
    html: `<html><body style="margin:0;padding:16px;background:#ffffff;">${secties.map((sectie) => sectie.html).join('')}</body></html>`,
  };
}
