import type { PoolConnection } from 'mysql2/promise';

/**
 * De teller-gebaseerde volgnummers (bestelnummer, zendingnummer, klantnummer)
 * deelden hetzelfde recept -- ophogen, uitlezen, met nullen opvullen -- maar
 * stonden drie keer los uitgeschreven, elk met een eigen padding-constante.
 *
 * Draait bewust op een meegegeven `connection`: het ophogen en uitlezen moeten
 * in dezelfde transactie zitten als waar het nummer voor gebruikt wordt, anders
 * kunnen twee gelijktijdige aanvragen hetzelfde nummer zien.
 */
const PADDING = 5;

export type CounterNaam = 'bestelnummer' | 'zendingnummer' | 'klantnummer';

export async function volgendNummer(
  connection: Pick<PoolConnection, 'query'>,
  counter: CounterNaam,
  prefix: string
): Promise<string> {
  await connection.query('UPDATE counters SET value = value + 1 WHERE id = ?', [counter]);
  const [rows] = await connection.query('SELECT value FROM counters WHERE id = ?', [counter]);
  const waarde = (rows as Array<{ value: number }>)[0].value;
  return `${prefix}${String(waarde).padStart(PADDING, '0')}`;
}
