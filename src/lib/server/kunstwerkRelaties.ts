import type { Pool } from 'mysql2/promise';

export type RelatieKolomNaam = 'segmentIds' | 'materiaalIds' | 'maatIds' | 'stijlIds' | 'onderwerpIds';

export interface KunstwerkRelaties {
  segmentIds: string[];
  materiaalIds: string[];
  maatIds: string[];
  stijlIds: string[];
  onderwerpIds: string[];
}

interface RelatieConfig {
  kolom: RelatieKolomNaam;
  tabel: string;
  kolomId: string;
}

const RELATIE_KOLOMMEN: readonly RelatieConfig[] = [
  { kolom: 'segmentIds', tabel: 'kunstwerkSegmenten', kolomId: 'segmentId' },
  { kolom: 'materiaalIds', tabel: 'kunstwerkMaterialen', kolomId: 'materiaalId' },
  { kolom: 'maatIds', tabel: 'kunstwerkMaten', kolomId: 'maatId' },
  { kolom: 'stijlIds', tabel: 'kunstwerkStijlen', kolomId: 'stijlId' },
  { kolom: 'onderwerpIds', tabel: 'kunstwerkOnderwerpen', kolomId: 'onderwerpId' },
];

const KOLOM_NAMEN: readonly string[] = RELATIE_KOLOMMEN.map((r) => r.kolom);

/**
 * Weigert een duplicaat-id binnen één array in plaats van hem stilzwijgend te
 * dedupliceren -- zelfde principe als de kolom-allowlist in tableColumns.ts:
 * onverwachte invoer wordt luid geweigerd, niet stilzwijgend gecorrigeerd.
 */
export class DuplicateRelatieError extends Error {
  constructor(public kolom: string) {
    super(`Kolom ${kolom} bevat een dubbele id`);
    this.name = 'DuplicateRelatieError';
  }
}

/** Splitst een request-body in relatiekolommen en de rest, voor POST/PATCH /api/kunstwerken. */
export function scheidRelaties(data: Record<string, unknown>): {
  relaties: Partial<Record<RelatieKolomNaam, string[]>>;
  rest: Record<string, unknown>;
} {
  const relaties: Partial<Record<RelatieKolomNaam, string[]>> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (KOLOM_NAMEN.includes(key)) {
      relaties[key as RelatieKolomNaam] = value as string[];
    } else {
      rest[key] = value;
    }
  }
  return { relaties, rest };
}

function legeRelaties(): KunstwerkRelaties {
  return { segmentIds: [], materiaalIds: [], maatIds: [], stijlIds: [], onderwerpIds: [] };
}

/** Haalt de relaties van meerdere kunstwerken in bulk op (één query per koppeltabel, geen N+1). */
export async function haalRelatiesOp(
  connection: Pick<Pool, 'query'>,
  kunstwerkIds: string[]
): Promise<Map<string, KunstwerkRelaties>> {
  const result = new Map<string, KunstwerkRelaties>();
  for (const id of kunstwerkIds) {
    result.set(id, legeRelaties());
  }
  if (kunstwerkIds.length === 0) return result;

  for (const { kolom, tabel, kolomId } of RELATIE_KOLOMMEN) {
    const [rows] = await connection.query(
      `SELECT kunstwerkId, \`${kolomId}\` AS relatedId FROM \`${tabel}\` WHERE kunstwerkId IN (?) ORDER BY kunstwerkId, volgorde ASC`,
      [kunstwerkIds]
    );
    for (const row of rows as Array<{ kunstwerkId: string; relatedId: string }>) {
      result.get(row.kunstwerkId)?.[kolom].push(row.relatedId);
    }
  }
  return result;
}

/** Haalt de relaties van één kunstwerk op. */
export async function haalRelatiesOpVoorEen(
  connection: Pick<Pool, 'query'>,
  kunstwerkId: string
): Promise<KunstwerkRelaties> {
  const alle = await haalRelatiesOp(connection, [kunstwerkId]);
  return alle.get(kunstwerkId) ?? legeRelaties();
}

/**
 * Vervangt, per meegegeven kolom, de volledige set koppelrijen voor dit kunstwerk:
 * DELETE + opnieuw INSERT met volgorde = array-index. Een kolom die niet in `data`
 * voorkomt wordt niet aangeraakt (partial update, zelfde gedrag als PATCH altijd
 * al had). Verwacht een eigen transactie van de aanroeper wanneer dit samen met een
 * wijziging op de kunstwerken-rij zelf atomisch moet zijn.
 */
export async function vervangRelaties(
  connection: Pick<Pool, 'query'>,
  kunstwerkId: string,
  data: Partial<Record<RelatieKolomNaam, string[]>>
): Promise<void> {
  for (const { kolom, tabel, kolomId } of RELATIE_KOLOMMEN) {
    if (!(kolom in data)) continue;
    const ids = data[kolom] ?? [];
    if (new Set(ids).size !== ids.length) {
      throw new DuplicateRelatieError(kolom);
    }
    await connection.query(`DELETE FROM \`${tabel}\` WHERE kunstwerkId = ?`, [kunstwerkId]);
    for (const [volgorde, relatedId] of ids.entries()) {
      await connection.query(
        `INSERT INTO \`${tabel}\` (kunstwerkId, \`${kolomId}\`, volgorde) VALUES (?, ?, ?)`,
        [kunstwerkId, relatedId, volgorde]
      );
    }
  }
}
