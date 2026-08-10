import { randomUUID } from 'crypto';
import type { Pool } from 'mysql2/promise';
import { getPool } from './db';
import { controleerKolommen, TABLE_COLUMNS, VERBORGEN_KOLOMMEN } from './tableColumns';

/**
 * Zet een identifier veilig tussen backticks. De allowlist in `tableColumns.ts`
 * is de echte bescherming; dit is de tweede laag, zodat een identifier die daar
 * ooit langs komt alsnog niet uit zijn quotes kan breken.
 */
function quoteIdent(naam: string): string {
  return `\`${naam.replace(/`/g, '``')}\``;
}

function serializeRow(data: Record<string, unknown>, jsonColumns: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = jsonColumns.includes(key) && value !== undefined ? JSON.stringify(value) : value;
  }
  return result;
}

/**
 * Leest een JSON-kolom uit. mysql2 parseert een native JSON-kolom zelf al op een
 * gewone `query()`, maar geeft hem als string terug zodra de waarde via een
 * expressie of een oudere kolomdefinitie binnenkomt -- vandaar de dubbele weg.
 * Stond eerder als losse ternary op zes plekken in de codebase.
 */
export function parseJsonKolom<T>(waarde: unknown, fallback: T): T {
  if (typeof waarde === 'string') {
    try {
      return JSON.parse(waarde) as T;
    } catch {
      // Eén stukgelopen rij mag geen hele lijst laten crashen met een 500.
      return fallback;
    }
  }
  return (waarde ?? fallback) as T;
}

function deserializeRow<T>(row: Record<string, unknown>, jsonColumns: string[]): T {
  const result: Record<string, unknown> = { ...row };
  for (const column of jsonColumns) {
    result[column] = parseJsonKolom(result[column], []);
  }
  return result as T;
}

/**
 * De kolommen die een SELECT mag teruggeven. `SELECT *` zou anders ook
 * `wachtwoordHash` meesturen -- zie VERBORGEN_KOLOMMEN.
 */
function selectLijst(table: string): string {
  const verborgen = VERBORGEN_KOLOMMEN[table];
  if (!verborgen || verborgen.length === 0) return '*';
  const zichtbaar = (TABLE_COLUMNS[table] ?? []).filter((kolom) => !verborgen.includes(kolom));
  return zichtbaar.map(quoteIdent).join(', ');
}

export async function listRows<T>(table: string, jsonColumns: string[] = []): Promise<T[]> {
  const [rows] = await getPool().query(`SELECT ${selectLijst(table)} FROM ${quoteIdent(table)}`);
  return (rows as Record<string, unknown>[]).map((row) => deserializeRow<T>(row, jsonColumns));
}

export async function getRow<T>(
  table: string,
  id: string,
  jsonColumns: string[] = []
): Promise<T | null> {
  const [rows] = await getPool().query(
    `SELECT ${selectLijst(table)} FROM ${quoteIdent(table)} WHERE id = ?`,
    [id]
  );
  const row = (rows as Record<string, unknown>[])[0];
  return row ? deserializeRow<T>(row, jsonColumns) : null;
}

/**
 * `connection` is optioneel, net als bij `updateRow` hieronder: een aanroeper die
 * al in een transactie zit kan de insert daarin meenemen, zodat de rij samen met
 * de rest van de handeling commit of samen met de rest verdwijnt.
 */
export async function insertRow<T extends { id?: string }>(
  table: string,
  data: Omit<T, 'id'>,
  jsonColumns: string[] = [],
  connection?: Pick<Pool, 'query'>
): Promise<T> {
  const id = randomUUID();
  const full = { id, ...data } as Record<string, unknown>;
  const serialized = serializeRow(full, jsonColumns);
  const columns = Object.keys(serialized);
  controleerKolommen(table, columns);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => serialized[column]);
  await (connection ?? getPool()).query(
    `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders})`,
    values
  );
  return full as T;
}

/**
 * `connection` is optioneel zodat een aanroeper die al in een transactie zit
 * dezelfde update kan draaien zónder de SQL met de hand te herbouwen -- wat
 * /api/klanten/[id] eerder wél deed, en daarmee ook de kolomcontrole hieronder
 * ontliep.
 */
export async function updateRow(
  table: string,
  id: string,
  data: Record<string, unknown>,
  jsonColumns: string[] = [],
  connection?: Pick<Pool, 'query'>
): Promise<void> {
  const serialized = serializeRow(data, jsonColumns);
  const columns = Object.keys(serialized);
  if (columns.length === 0) return;
  controleerKolommen(table, columns);
  const assignments = columns.map((column) => `${quoteIdent(column)} = ?`).join(', ');
  const values = columns.map((column) => serialized[column]);
  await (connection ?? getPool()).query(
    `UPDATE ${quoteIdent(table)} SET ${assignments} WHERE id = ?`,
    [...values, id]
  );
}

/**
 * `connection` is optioneel, om dezelfde reden als bij `updateRow` hierboven: een
 * aanroeper die de verwijdering binnen een transactie moet combineren met een
 * voorafgaande `SELECT ... FOR UPDATE` (bijv. /api/kunstwerken/[id]'s DELETE, dat het
 * verwijderslot op een besteld kunstwerk anders met een race tussen de check en de
 * verwijdering zou laten zitten) kan zo dezelfde connection meegeven in plaats van de
 * SQL met de hand te herbouwen.
 */
export async function deleteRow(
  table: string,
  id: string,
  connection?: Pick<Pool, 'query'>
): Promise<void> {
  await (connection ?? getPool()).query(`DELETE FROM ${quoteIdent(table)} WHERE id = ?`, [id]);
}
