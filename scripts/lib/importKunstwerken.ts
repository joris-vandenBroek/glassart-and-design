import { imageSizeFromFile } from 'image-size/fromFile';
import { detectFormaatFromDimensions } from '../../src/lib/detectKunstwerkFormaat';
import type { KunstwerkFormaat } from '../../src/components/beheer/materiaalTypes';

function escapeRegex(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function bepaalVolgendeCode(bestaandeCodes: string[], prefix: string): string {
  const patroon = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`);
  let hoogsteNummer = 0;
  let cijferbreedte = 3;
  for (const code of bestaandeCodes) {
    const match = code.match(patroon);
    if (!match) continue;
    const nummer = Number(match[1]);
    if (nummer > hoogsteNummer) {
      hoogsteNummer = nummer;
      cijferbreedte = match[1].length;
    }
  }
  const volgendeNummer = String(hoogsteNummer + 1).padStart(cijferbreedte, '0');
  return `${prefix}-${volgendeNummer}`;
}

export function kiesMatendeMaten(
  maten: Array<{ id: string; breedte: number; hoogte: number }>,
  formaat: KunstwerkFormaat
): string[] {
  if (formaat === 'alle') return maten.map((maat) => maat.id);
  return maten
    .filter((maat) => detectFormaatFromDimensions(maat.breedte, maat.hoogte) === formaat)
    .map((maat) => maat.id);
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function mimeTypeVoorBestand(bestandsnaam: string): string {
  const extensie = bestandsnaam.slice(bestandsnaam.lastIndexOf('.')).toLowerCase();
  const mimeType = MIME_TYPES[extensie];
  if (!mimeType) {
    throw new Error(`Niet-ondersteunde bestandsextensie: '${extensie}'.`);
  }
  return mimeType;
}

export function vindExacteMatch<T extends { omschrijving: string }>(
  bestaande: T[],
  omschrijving: string
): T | null {
  const genormaliseerd = omschrijving.trim().toLowerCase();
  return bestaande.find((item) => item.omschrijving.trim().toLowerCase() === genormaliseerd) ?? null;
}

export async function bepaalFormaatVanBestand(
  bestandspad: string
): Promise<{ breedte: number; hoogte: number; formaat: KunstwerkFormaat }> {
  const { width, height } = await imageSizeFromFile(bestandspad);
  return {
    breedte: width,
    hoogte: height,
    formaat: detectFormaatFromDimensions(width, height),
  };
}

export function parseArgs(args: string[]): { subcommand: string; opts: Record<string, string> } {
  const [subcommand, ...rest] = args;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const vlag = rest[i];
    if (!vlag.startsWith('--')) {
      throw new Error(`Ongeldig argument: onverwacht argument '${vlag}', verwacht een vlag die met -- begint.`);
    }
    const waarde = rest[i + 1];
    if (waarde === undefined) {
      throw new Error(`Ongeldig argument: '${vlag}' heeft geen waarde.`);
    }
    opts[vlag.slice(2)] = waarde;
  }
  return { subcommand, opts };
}
