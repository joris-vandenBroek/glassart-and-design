import { getPool } from './db';

export const KUNSTWERKEN_JSON_COLUMNS = [
  'segmentIds',
  'materiaalIds',
  'maatIds',
  'stijlIds',
  'onderwerpIds',
];

/**
 * Vergelijkt hoofdletterongevoelig, want dat is precies wat de UNIQUE-index op
 * `kunstwerken.code` doet -- de tabel staat op utf8mb4_general_ci. Zou dit binair
 * vergelijken, dan meldde het scherm "code is vrij" en gooide MySQL er alsnog een
 * duplicate-key overheen.
 */
export async function codeIsInGebruik(
  code: string,
  behalveKunstwerkId: string | null
): Promise<boolean> {
  const [rows] = behalveKunstwerkId
    ? await getPool().query('SELECT 1 FROM kunstwerken WHERE code = ? AND id <> ? LIMIT 1', [
        code,
        behalveKunstwerkId,
      ])
    : await getPool().query('SELECT 1 FROM kunstwerken WHERE code = ? LIMIT 1', [code]);
  return (rows as unknown[]).length > 0;
}

/**
 * Ongeacht de status van de bestelling: ook een geannuleerde of afgeronde bestelling
 * is mogelijk al bij de drukker geweest.
 */
export async function codeKomtVoorInBestelling(code: string): Promise<boolean> {
  const [rows] = await getPool().query('SELECT 1 FROM bestellines WHERE code = ? LIMIT 1', [code]);
  return (rows as unknown[]).length > 0;
}

/**
 * De SELECT hierboven levert de nette foutmelding, maar hij is niet de garantie: een
 * gewone SELECT op een rij die nog niet bestaat neemt geen slot, dus twee medewerkers
 * die tegelijk dezelfde code opslaan komen er beide langs. De UNIQUE-index vangt dat,
 * en zonder deze vertaling maakt withApiErrorHandling van die botsing een 500 in plaats
 * van dezelfde 409 als de voorcontrole.
 */
export function isDuplicateCodeError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY';
}
