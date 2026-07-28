import { randomUUID } from 'crypto';
import { getPool } from './db';

function serializeRow(data: Record<string, unknown>, jsonColumns: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = jsonColumns.includes(key) && value !== undefined ? JSON.stringify(value) : value;
  }
  return result;
}

function deserializeRow<T>(row: Record<string, unknown>, jsonColumns: string[]): T {
  const result: Record<string, unknown> = { ...row };
  for (const column of jsonColumns) {
    if (result[column] != null && typeof result[column] === 'string') {
      result[column] = JSON.parse(result[column] as string);
    }
  }
  return result as T;
}

export async function listRows<T>(table: string, jsonColumns: string[] = []): Promise<T[]> {
  const [rows] = await getPool().query(`SELECT * FROM \`${table}\``);
  return (rows as Record<string, unknown>[]).map((row) => deserializeRow<T>(row, jsonColumns));
}

export async function getRow<T>(
  table: string,
  id: string,
  jsonColumns: string[] = []
): Promise<T | null> {
  const [rows] = await getPool().query(`SELECT * FROM \`${table}\` WHERE id = ?`, [id]);
  const row = (rows as Record<string, unknown>[])[0];
  return row ? deserializeRow<T>(row, jsonColumns) : null;
}

export async function insertRow<T extends { id?: string }>(
  table: string,
  data: Omit<T, 'id'>,
  jsonColumns: string[] = []
): Promise<T> {
  const id = randomUUID();
  const full = { id, ...data } as Record<string, unknown>;
  const serialized = serializeRow(full, jsonColumns);
  const columns = Object.keys(serialized);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => serialized[column]);
  await getPool().query(
    `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
    values
  );
  return full as T;
}

export async function updateRow(
  table: string,
  id: string,
  data: Record<string, unknown>,
  jsonColumns: string[] = []
): Promise<void> {
  const serialized = serializeRow(data, jsonColumns);
  const columns = Object.keys(serialized);
  if (columns.length === 0) return;
  const assignments = columns.map((column) => `\`${column}\` = ?`).join(', ');
  const values = columns.map((column) => serialized[column]);
  await getPool().query(`UPDATE \`${table}\` SET ${assignments} WHERE id = ?`, [...values, id]);
}

export async function deleteRow(table: string, id: string): Promise<void> {
  await getPool().query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
}
