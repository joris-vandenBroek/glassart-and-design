import fs from 'node:fs';

export interface ImportBatchManifestKunstwerk {
  bestandsnaam: string;
  formaat: 'staand' | 'liggend' | 'vierkant';
  maten: Array<{ breedte: number; hoogte: number }>;
  segmenten: string[];
  stijlen: string[];
  onderwerpen: string[];
  omschrijvingNl: string;
  omschrijvingEn: string;
  omschrijvingDe: string;
  omschrijvingFr: string;
}

export interface ImportBatchManifest {
  versie: 1;
  collectiecode: string;
  kunstenaarNaam: string;
  aiGegenereerd: boolean;
  brondirectory: string;
  kunstwerken: ImportBatchManifestKunstwerk[];
}

const FORMATEN = ['staand', 'liggend', 'vierkant'];
const VERPLICHTE_TEKSTVELDEN = ['omschrijvingNl', 'omschrijvingEn', 'omschrijvingDe', 'omschrijvingFr'];

function valideerKunstwerkItem(item: unknown, index: number): void {
  if (typeof item !== 'object' || item === null) {
    throw new Error(`kunstwerken[${index}] is geen JSON-object.`);
  }
  const kunstwerk = item as Record<string, unknown>;
  if (typeof kunstwerk.bestandsnaam !== 'string' || kunstwerk.bestandsnaam.trim() === '') {
    throw new Error(`kunstwerken[${index}].bestandsnaam ontbreekt.`);
  }
  if (typeof kunstwerk.formaat !== 'string' || !FORMATEN.includes(kunstwerk.formaat)) {
    throw new Error(`kunstwerken[${index}].formaat moet staand, liggend of vierkant zijn.`);
  }
  if (!Array.isArray(kunstwerk.maten)) {
    throw new Error(`kunstwerken[${index}].maten moet een array zijn.`);
  }
  for (const maat of kunstwerk.maten as unknown[]) {
    const m = maat as Record<string, unknown>;
    if (typeof m.breedte !== 'number' || typeof m.hoogte !== 'number') {
      throw new Error(`kunstwerken[${index}].maten bevat een waarde zonder numerieke breedte/hoogte.`);
    }
  }
  for (const veld of ['segmenten', 'stijlen', 'onderwerpen']) {
    if (!Array.isArray(kunstwerk[veld])) {
      throw new Error(`kunstwerken[${index}].${veld} moet een array zijn.`);
    }
  }
  for (const veld of VERPLICHTE_TEKSTVELDEN) {
    if (typeof kunstwerk[veld] !== 'string' || (kunstwerk[veld] as string).trim() === '') {
      throw new Error(`kunstwerken[${index}].${veld} ontbreekt.`);
    }
  }
}

export function valideerManifest(data: unknown): ImportBatchManifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Manifest is geen JSON-object.');
  }
  const manifest = data as Record<string, unknown>;
  if (manifest.versie !== 1) {
    throw new Error(`Onbekende manifestversie: ${JSON.stringify(manifest.versie)}.`);
  }
  for (const veld of ['collectiecode', 'kunstenaarNaam', 'brondirectory']) {
    if (typeof manifest[veld] !== 'string' || (manifest[veld] as string).trim() === '') {
      throw new Error(`Manifest mist een niet-lege tekstwaarde voor '${veld}'.`);
    }
  }
  if (typeof manifest.aiGegenereerd !== 'boolean') {
    throw new Error("Manifest mist een boolean 'aiGegenereerd'.");
  }
  if (!Array.isArray(manifest.kunstwerken) || manifest.kunstwerken.length === 0) {
    throw new Error("Manifest mist een niet-lege lijst 'kunstwerken'.");
  }
  manifest.kunstwerken.forEach((item, index) => valideerKunstwerkItem(item, index));
  return manifest as unknown as ImportBatchManifest;
}

export function leesManifest(pad: string): ImportBatchManifest {
  const inhoud = fs.readFileSync(pad, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(inhoud);
  } catch {
    throw new Error(`'${pad}' bevat geen geldige JSON.`);
  }
  return valideerManifest(data);
}
