import type { Bestelling } from '@/components/beheer/BestellingenSection';

export interface Zending {
  id: string;
  drukkerId: string;
  drukkerNaam: string;
  verzondenOp: Date | null;
  bestellingIds: string[];
}

export interface ZendingGenoten {
  zending: Zending;
  bestellingen: Bestelling[];
}

export async function fetchZendingen(bestellingIds: string[]): Promise<Zending[]> {
  if (bestellingIds.length === 0) {
    return [];
  }
  const query = encodeURIComponent(bestellingIds.join(','));
  const response = await fetch(`/api/drukkerzendingen?bestellingIds=${query}`);
  if (!response.ok) {
    throw new Error('zending lookup failed');
  }
  const rows = (await response.json()) as Array<{
    id: string;
    drukkerId: string;
    drukkerNaam: string;
    verzondenOp: string | null;
    bestellingIds: string[] | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    drukkerId: row.drukkerId,
    drukkerNaam: row.drukkerNaam,
    verzondenOp: row.verzondenOp ? new Date(row.verzondenOp) : null,
    bestellingIds: row.bestellingIds ?? [],
  }));
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
