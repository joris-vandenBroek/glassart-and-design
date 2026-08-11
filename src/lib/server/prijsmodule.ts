import type { Pool, PoolConnection } from 'mysql2/promise';
import { pasPrijsgroepToe, type PrijsgroepAanpassing } from '@/lib/prijsgroep';
import { parseJsonKolom } from '@/lib/server/crud';

export { pasPrijsgroepToe };
export type { PrijsgroepAanpassing };

export type Queryable = Pool | PoolConnection;

export interface PrijsCombinatie {
  maatId: string;
  materiaalId: string;
  prijs: number;
}

export type LijnPrijsResultaat =
  | { status: 'vast'; prijs: number }
  | { status: 'op-aanvraag' }
  | { status: 'onbekend' };

export function combineerPrijs(basisPrijs: number, opslag: number): number {
  return Math.round((basisPrijs + opslag) * 100) / 100;
}

/**
 * kunstenaarAfspraken hangt op de UUID van de kunstenaar (id is daar tegelijk primary
 * key en foreign key), terwijl een kunstwerk het kunstenaarnr draagt -- vandaar de
 * join. Zie het ontwerp, beslissing 2.
 */
export async function prijsopslagVoorKunstenaar(
  db: Queryable,
  kunstenaarnr: string | null
): Promise<number> {
  if (!kunstenaarnr) return 0;
  const [rows] = await db.query(
    `SELECT a.prijsopslag
     FROM kunstenaarAfspraken a
     JOIN kunstenaars k ON k.id = a.id
     WHERE k.kunstenaarnr = ?`,
    [kunstenaarnr]
  );
  const row = (rows as Array<{ prijsopslag: string | null }>)[0];
  return row?.prijsopslag != null ? Number(row.prijsopslag) : 0;
}

export async function prijsgroepVoorKlant(db: Queryable, klantId: string | null): Promise<PrijsgroepAanpassing | null> {
  if (!klantId) return null;
  const [rows] = await db.query(
    `SELECT p.kortingspercentage, p.opslagpercentage
     FROM klanten k JOIN prijsgroepen p ON p.id = k.prijsgroepId
     WHERE k.id = ?`,
    [klantId]
  );
  const row = (rows as Array<{ kortingspercentage: string | null; opslagpercentage: string | null }>)[0];
  if (!row) return null;
  return {
    kortingspercentage: row.kortingspercentage != null ? Number(row.kortingspercentage) : null,
    opslagpercentage: row.opslagpercentage != null ? Number(row.opslagpercentage) : null,
  };
}

export async function berekenPrijzenVoorCombinaties(
  db: Queryable,
  kunstenaarnr: string | null,
  materiaalIds: string[],
  maatIds: string[]
): Promise<PrijsCombinatie[]> {
  if (materiaalIds.length === 0 || maatIds.length === 0) {
    return [];
  }
  const [matrixRows] = await db.query(
    'SELECT maatId, materiaalId, prijs FROM prijsmatrix WHERE maatId IN (?) AND materiaalId IN (?) AND prijs IS NOT NULL',
    [maatIds, materiaalIds]
  );
  const opslag = await prijsopslagVoorKunstenaar(db, kunstenaarnr);
  return (matrixRows as Array<{ maatId: string; materiaalId: string; prijs: string }>).map((row) => ({
    maatId: row.maatId,
    materiaalId: row.materiaalId,
    prijs: combineerPrijs(Number(row.prijs), opslag),
  }));
}

export async function berekenPrijzenVoorAlleKunstwerken(
  db: Queryable,
  klantId: string | null = null
): Promise<Record<string, PrijsCombinatie[]>> {
  const [kunstwerkRows] = await db.query('SELECT id, kunstenaarnr, materiaalIds, maatIds FROM kunstwerken');
  const [matrixRows] = await db.query('SELECT maatId, materiaalId, prijs FROM prijsmatrix WHERE prijs IS NOT NULL');
  const matrixByKey = new Map<string, number>();
  for (const row of matrixRows as Array<{ maatId: string; materiaalId: string; prijs: string }>) {
    matrixByKey.set(`${row.maatId}:${row.materiaalId}`, Number(row.prijs));
  }
  const [afsprakenRows] = await db.query(
    `SELECT k.kunstenaarnr, a.prijsopslag
     FROM kunstenaarAfspraken a
     JOIN kunstenaars k ON k.id = a.id`
  );
  const opslagByKunstenaarnr = new Map<string, number>();
  for (const row of afsprakenRows as Array<{ kunstenaarnr: string; prijsopslag: string | null }>) {
    opslagByKunstenaarnr.set(row.kunstenaarnr, row.prijsopslag != null ? Number(row.prijsopslag) : 0);
  }
  const prijsgroep = await prijsgroepVoorKlant(db, klantId);

  const result: Record<string, PrijsCombinatie[]> = {};
  for (const row of kunstwerkRows as Array<{
    id: string;
    kunstenaarnr: string | null;
    materiaalIds: string | string[] | null;
    maatIds: string | string[] | null;
  }>) {
    const materiaalIds = parseJsonKolom<string[]>(row.materiaalIds, []);
    const maatIds = parseJsonKolom<string[]>(row.maatIds, []);
    const opslag = row.kunstenaarnr ? opslagByKunstenaarnr.get(row.kunstenaarnr) ?? 0 : 0;
    const combinaties: PrijsCombinatie[] = [];
    for (const materiaalId of materiaalIds) {
      for (const maatId of maatIds) {
        const basisPrijs = matrixByKey.get(`${maatId}:${materiaalId}`);
        if (basisPrijs === undefined) continue;
        const prijs = pasPrijsgroepToe(combineerPrijs(basisPrijs, opslag), prijsgroep);
        combinaties.push({ maatId, materiaalId, prijs });
      }
    }
    result[row.id] = combinaties;
  }
  return result;
}

export async function berekenBestellijnPrijs(
  db: Queryable,
  kunstwerk: { kunstenaarnr: string | null; maatIds: string[]; prijsPerM2: number | null },
  line: { maatId: string; materiaalId: string; breedte?: number; hoogte?: number },
  klantId: string | null = null
): Promise<LijnPrijsResultaat> {
  if (kunstwerk.maatIds.length === 0) {
    if (kunstwerk.prijsPerM2 == null || !line.breedte || !line.hoogte) {
      return { status: 'onbekend' };
    }
    const basisPrijs = Math.round((line.breedte / 100) * (line.hoogte / 100) * kunstwerk.prijsPerM2 * 100) / 100;
    const prijsgroep = await prijsgroepVoorKlant(db, klantId);
    return {
      status: 'vast',
      prijs: pasPrijsgroepToe(basisPrijs, prijsgroep),
    };
  }

  if (!kunstwerk.maatIds.includes(line.maatId)) {
    return { status: 'op-aanvraag' };
  }

  const [matrixRows] = await db.query('SELECT prijs FROM prijsmatrix WHERE maatId = ? AND materiaalId = ?', [
    line.maatId,
    line.materiaalId,
  ]);
  const matrixPrijs = (matrixRows as Array<{ prijs: string | null }>)[0]?.prijs;
  if (matrixPrijs == null) {
    return { status: 'onbekend' };
  }
  const opslag = await prijsopslagVoorKunstenaar(db, kunstwerk.kunstenaarnr);
  const prijsgroep = await prijsgroepVoorKlant(db, klantId);
  return { status: 'vast', prijs: pasPrijsgroepToe(combineerPrijs(Number(matrixPrijs), opslag), prijsgroep) };
}
