import type { Bestelling } from '@/components/beheer/BestellingenSection';

export interface Zending {
  id: string;
  drukkernr: string;
  drukkerNaam: string;
  verzondenOp: Date | null;
  bestellingIds: string[];
}

export interface ZendingGenoten {
  zending: Zending;
  bestellingen: Bestelling[];
}

// Zelfde grens als de MAX_IDS-check in de /api/drukkerzendingen-route: die
// route geeft 400 boven dit aantal ids in één aanroep. Een bulkselectie kan
// die grens in de beheeromgeving ("alles selecteren" onder een filter)
// makkelijk overschrijden, dus hakken we hier zelf in blokken -- de route zelf
// blijft ongemoeid, die grens is daar een zinvolle bescherming tegen een
// onbedoeld enorme query.
const MAX_IDS_PER_AANVRAAG = 200;

async function fetchZendingenBatch(bestellingIds: string[]): Promise<Zending[]> {
  const query = encodeURIComponent(bestellingIds.join(','));
  const response = await fetch(`/api/drukkerzendingen?bestellingIds=${query}`);
  if (!response.ok) {
    throw new Error('zending lookup failed');
  }
  const rows = (await response.json()) as Array<{
    id: string;
    drukkernr: string;
    drukkerNaam: string;
    verzondenOp: string | null;
    bestellingIds: string[] | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    drukkernr: row.drukkernr,
    drukkerNaam: row.drukkerNaam,
    verzondenOp: row.verzondenOp ? new Date(row.verzondenOp) : null,
    bestellingIds: row.bestellingIds ?? [],
  }));
}

export async function fetchZendingen(bestellingIds: string[]): Promise<Zending[]> {
  if (bestellingIds.length === 0) {
    return [];
  }

  const blokken: string[][] = [];
  for (let i = 0; i < bestellingIds.length; i += MAX_IDS_PER_AANVRAAG) {
    blokken.push(bestellingIds.slice(i, i + MAX_IDS_PER_AANVRAAG));
  }

  const resultatenPerBlok = await Promise.all(blokken.map((blok) => fetchZendingenBatch(blok)));

  // Dezelfde zending kan in meerdere blokken terugkomen (bijvoorbeeld als hij
  // bestellingen bevat die in verschillende blokken van de oorspronkelijke
  // selectie zitten) -- dedupliceren op zending-id zodat de aanroeper nooit
  // dezelfde zending twee keer ziet.
  const gezienIds = new Set<string>();
  const resultaat: Zending[] = [];
  for (const zendingen of resultatenPerBlok) {
    for (const zending of zendingen) {
      if (gezienIds.has(zending.id)) continue;
      gezienIds.add(zending.id);
      resultaat.push(zending);
    }
  }
  return resultaat;
}

/**
 * Bepaalt welke bestellingen uit dezelfde drukkerzending nog open staan.
 * Bestellingen die nu worden afgerond vallen af, net als alles wat de status
 * "Verstuurd naar drukker" niet (meer) heeft of niet meer in de lijst voorkomt.
 * Een bestelling verschijnt hoogstens onder één zending, ook als hij in
 * meerdere zendingen zit (bijvoorbeeld na opnieuw versturen).
 */
export function openstaandeZendingGenoten(
  zendingen: Zending[],
  afTeRonden: Bestelling[],
  alleBestellingen: Bestelling[]
): ZendingGenoten[] {
  const afTeRondenIds = new Set(afTeRonden.map((b) => b.id));
  const bestellingById = new Map(alleBestellingen.map((b) => [b.id, b]));
  const alGezien = new Set<string>();
  const resultaat: ZendingGenoten[] = [];

  for (const zending of zendingen) {
    const bestellingen = zending.bestellingIds
      .filter((id) => !afTeRondenIds.has(id) && !alGezien.has(id))
      .map((id) => bestellingById.get(id))
      .filter((b): b is Bestelling => b !== undefined && b.status === 'Verstuurd naar drukker');
    if (bestellingen.length === 0) {
      continue;
    }
    bestellingen.forEach((b) => alGezien.add(b.id));
    resultaat.push({ zending, bestellingen });
  }

  return resultaat;
}
