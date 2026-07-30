import type { Pool, PoolConnection } from 'mysql2/promise';

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

export async function prijsopslagVoorKunstenaar(db: Queryable, kunstenaarId: string | null): Promise<number> {
  if (!kunstenaarId) return 0;
  const [rows] = await db.query('SELECT prijsopslag FROM kunstenaarAfspraken WHERE id = ?', [kunstenaarId]);
  const row = (rows as Array<{ prijsopslag: string | null }>)[0];
  return row?.prijsopslag != null ? Number(row.prijsopslag) : 0;
}

export async function berekenPrijzenVoorCombinaties(
  db: Queryable,
  kunstenaarId: string | null,
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
  const opslag = await prijsopslagVoorKunstenaar(db, kunstenaarId);
  return (matrixRows as Array<{ maatId: string; materiaalId: string; prijs: string }>).map((row) => ({
    maatId: row.maatId,
    materiaalId: row.materiaalId,
    prijs: combineerPrijs(Number(row.prijs), opslag),
  }));
}

export async function berekenPrijzenVoorAlleKunstwerken(db: Queryable): Promise<Record<string, PrijsCombinatie[]>> {
  const [kunstwerkRows] = await db.query('SELECT id, kunstenaarId, materiaalIds, maatIds FROM kunstwerken');
  const [matrixRows] = await db.query('SELECT maatId, materiaalId, prijs FROM prijsmatrix WHERE prijs IS NOT NULL');
  const matrixByKey = new Map<string, number>();
  for (const row of matrixRows as Array<{ maatId: string; materiaalId: string; prijs: string }>) {
    matrixByKey.set(`${row.maatId}:${row.materiaalId}`, Number(row.prijs));
  }
  const [afsprakenRows] = await db.query('SELECT id, prijsopslag FROM kunstenaarAfspraken');
  const opslagByKunstenaarId = new Map<string, number>();
  for (const row of afsprakenRows as Array<{ id: string; prijsopslag: string | null }>) {
    opslagByKunstenaarId.set(row.id, row.prijsopslag != null ? Number(row.prijsopslag) : 0);
  }

  const result: Record<string, PrijsCombinatie[]> = {};
  for (const row of kunstwerkRows as Array<{
    id: string;
    kunstenaarId: string | null;
    materiaalIds: string | string[] | null;
    maatIds: string | string[] | null;
  }>) {
    const materiaalIds: string[] = row.materiaalIds
      ? typeof row.materiaalIds === 'string'
        ? JSON.parse(row.materiaalIds)
        : row.materiaalIds
      : [];
    const maatIds: string[] = row.maatIds
      ? typeof row.maatIds === 'string'
        ? JSON.parse(row.maatIds)
        : row.maatIds
      : [];
    const opslag = row.kunstenaarId ? opslagByKunstenaarId.get(row.kunstenaarId) ?? 0 : 0;
    const combinaties: PrijsCombinatie[] = [];
    for (const materiaalId of materiaalIds) {
      for (const maatId of maatIds) {
        const basisPrijs = matrixByKey.get(`${maatId}:${materiaalId}`);
        if (basisPrijs === undefined) continue;
        combinaties.push({ maatId, materiaalId, prijs: combineerPrijs(basisPrijs, opslag) });
      }
    }
    result[row.id] = combinaties;
  }
  return result;
}

export async function berekenBestellijnPrijs(
  db: Queryable,
  kunstwerk: { kunstenaarId: string | null; maatIds: string[]; prijsPerM2: number | null },
  line: { maatId: string; materiaalId: string; breedte?: number; hoogte?: number }
): Promise<LijnPrijsResultaat> {
  if (kunstwerk.maatIds.length === 0) {
    if (kunstwerk.prijsPerM2 == null || !line.breedte || !line.hoogte) {
      return { status: 'onbekend' };
    }
    return {
      status: 'vast',
      prijs: Math.round((line.breedte / 100) * (line.hoogte / 100) * kunstwerk.prijsPerM2 * 100) / 100,
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
  const opslag = await prijsopslagVoorKunstenaar(db, kunstwerk.kunstenaarId);
  return { status: 'vast', prijs: combineerPrijs(Number(matrixPrijs), opslag) };
}
