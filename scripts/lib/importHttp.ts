import fs from 'node:fs/promises';
import path from 'node:path';
import { mimeTypeVoorBestand, vindExacteMatch } from './importKunstwerken';

const SESSION_COOKIE_NAME = 'session_id';

interface MeertaligeOmschrijving {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface ReferentieData {
  kunstenaars: Array<{ kunstenaarnr: string; naam: string }>;
  segmenten: MeertaligeOmschrijving[];
  stijlen: MeertaligeOmschrijving[];
  onderwerpen: MeertaligeOmschrijving[];
  materialen: Array<MeertaligeOmschrijving & { materiaalsoortId: string; materiaaldikte: number }>;
  maten: Array<{ id: string; breedte: number; hoogte: number }>;
  kunstwerkCodes: string[];
}

export async function logIn(
  baseUrl: string,
  email: string,
  wachtwoord: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/api/auth/medewerker-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: wachtwoord }),
  });
  if (!response.ok) {
    throw new Error(`Inloggen mislukt op ${baseUrl} (status ${response.status}).`);
  }
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie || !setCookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error(`Geen sessiecookie ontvangen van ${baseUrl}.`);
  }
  return setCookie.split(';')[0];
}

export async function haalReferentieOp(
  baseUrl: string,
  sessieCookie: string,
  fetchImpl: typeof fetch = fetch
): Promise<ReferentieData> {
  async function haalOp<T>(pad: string): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${pad}`, { headers: { cookie: sessieCookie } });
    if (!response.ok) {
      throw new Error(`Ophalen van ${pad} op ${baseUrl} mislukt (status ${response.status}).`);
    }
    return (await response.json()) as T;
  }

  const [kunstenaars, segmenten, stijlen, onderwerpen, materialen, maten, kunstwerken] = await Promise.all([
    haalOp<Array<{ kunstenaarnr: string; naam: string }>>('/api/kunstenaars'),
    haalOp<MeertaligeOmschrijving[]>('/api/segmenten'),
    haalOp<MeertaligeOmschrijving[]>('/api/stijlen'),
    haalOp<MeertaligeOmschrijving[]>('/api/onderwerpen'),
    haalOp<Array<MeertaligeOmschrijving & { materiaalsoortId: string; materiaaldikte: number }>>('/api/materialen'),
    haalOp<Array<{ id: string; breedte: number; hoogte: number }>>('/api/maten'),
    haalOp<Array<{ code: string }>>('/api/kunstwerken'),
  ]);

  return {
    kunstenaars: kunstenaars.map(({ kunstenaarnr, naam }) => ({ kunstenaarnr, naam })),
    segmenten,
    stijlen,
    onderwerpen,
    materialen,
    maten,
    kunstwerkCodes: kunstwerken.map((kunstwerk) => kunstwerk.code),
  };
}

export async function uploadFoto(
  baseUrl: string,
  sessieCookie: string,
  bestandspad: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const buffer = await fs.readFile(bestandspad);
  const bestandsnaam = path.basename(bestandspad);
  const form = new FormData();
  form.append('foto', new File([buffer], bestandsnaam, { type: mimeTypeVoorBestand(bestandsnaam) }));

  const response = await fetchImpl(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { cookie: sessieCookie },
    body: form,
  });
  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || typeof data?.url !== 'string') {
    throw new Error(`Foto-upload van ${bestandspad} mislukt: ${data?.error ?? response.status}`);
  }
  return data.url;
}

export async function maakOfHergebruikLookupWaarde(
  baseUrl: string,
  sessieCookie: string,
  tabel: 'segmenten' | 'stijlen' | 'onderwerpen',
  omschrijvingNl: string,
  omschrijvingFr: string,
  omschrijvingDe: string,
  omschrijvingEn: string,
  fetchImpl: typeof fetch = fetch
): Promise<MeertaligeOmschrijving & { hergebruikt: boolean }> {
  const lijstResponse = await fetchImpl(`${baseUrl}/api/${tabel}`, { headers: { cookie: sessieCookie } });
  if (!lijstResponse.ok) {
    throw new Error(`Ophalen van ${tabel} op ${baseUrl} mislukt (status ${lijstResponse.status}).`);
  }
  const bestaande = (await lijstResponse.json()) as MeertaligeOmschrijving[];
  const match = vindExacteMatch(bestaande, omschrijvingNl);
  if (match) {
    return { ...match, hergebruikt: true };
  }

  const createResponse = await fetchImpl(`${baseUrl}/api/${tabel}`, {
    method: 'POST',
    headers: { cookie: sessieCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ omschrijvingNl, omschrijvingFr, omschrijvingDe, omschrijvingEn }),
  });
  if (!createResponse.ok) {
    throw new Error(
      `Aanmaken van '${omschrijvingNl}' in ${tabel} op ${baseUrl} mislukt (status ${createResponse.status}).`
    );
  }
  const created = (await createResponse.json()) as MeertaligeOmschrijving;
  return { ...created, hergebruikt: false };
}

export interface NieuwKunstwerk {
  code: string;
  foto: string;
  kunstenaarnr: string;
  formaat: 'staand' | 'liggend' | 'vierkant';
  omschrijvingNl: string;
  omschrijvingEn: string;
  omschrijvingDe: string;
  omschrijvingFr: string;
  segmentIds: string[];
  stijlIds: string[];
  onderwerpIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  aiGegenereerd: boolean;
}

export type MaakKunstwerkResultaat =
  | { status: 'aangemaakt'; id: string; code: string }
  | { status: 'code-bestaat-al' };

export async function maakKunstwerk(
  baseUrl: string,
  sessieCookie: string,
  kunstwerk: NieuwKunstwerk,
  fetchImpl: typeof fetch = fetch
): Promise<MaakKunstwerkResultaat> {
  const response = await fetchImpl(`${baseUrl}/api/kunstwerken`, {
    method: 'POST',
    headers: { cookie: sessieCookie, 'content-type': 'application/json' },
    body: JSON.stringify(kunstwerk),
  });
  if (response.status === 409) {
    return { status: 'code-bestaat-al' };
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`Aanmaken van kunstwerk ${kunstwerk.code} op ${baseUrl} mislukt: ${data?.error ?? response.status}`);
  }
  const created = (await response.json()) as { id: string; code: string };
  return { status: 'aangemaakt', id: created.id, code: created.code };
}

// Leest en parseert een JSON-payload uit een bestand -- gebruikt door de CLI's
// --json-bestand-optie (maak-kunstwerk/maak-kunstenaar) zodat de agent verkoopteksten met
// apostrofs eerst wegschrijft met de Write-tool in plaats van ze als shell-argument te
// moeten quoten.
export async function leesJsonBestand(pad: string): Promise<unknown> {
  const inhoud = await fs.readFile(pad, 'utf8');
  return JSON.parse(inhoud);
}

export async function downloadBestand(
  url: string,
  naarPad: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Downloaden van ${url} mislukt (status ${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(naarPad), { recursive: true });
  await fs.writeFile(naarPad, buffer);
}

export interface NieuweKunstenaar {
  naam: string;
  foto: string | null;
  website: string | null;
  omschrijvingNl: string;
  omschrijvingEn: string;
  omschrijvingDe: string;
  omschrijvingFr: string;
  exclusieveKlantIds: string[];
}

export async function maakKunstenaar(
  baseUrl: string,
  sessieCookie: string,
  kunstenaar: NieuweKunstenaar,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${baseUrl}/api/kunstenaars`, {
    method: 'POST',
    headers: { cookie: sessieCookie, 'content-type': 'application/json' },
    body: JSON.stringify(kunstenaar),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      `Aanmaken van kunstenaar '${kunstenaar.naam}' op ${baseUrl} mislukt: ${data?.error ?? response.status}`
    );
  }
  return (await response.json()) as Record<string, unknown>;
}
