import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';

// Begrenst de OR-keten in de query; een grotere selectie dan dit komt in de
// beheeromgeving niet voor en zou alleen een onbedoeld enorme query opleveren.
const MAX_IDS = 200;

export async function GET(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get('bestellingIds') ?? '';
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: 'too-many-ids' }, { status: 400 });
  }

  // JSON_CONTAINS per id, ge-OR'd. Bewust geen JSON_OVERLAPS: dat vereist
  // MySQL 8.0.17+, terwijl JSON_CONTAINS vanaf 5.7 beschikbaar is.
  const where = ids.map(() => 'JSON_CONTAINS(z.bestellingIds, JSON_QUOTE(?))').join(' OR ');
  const [rows] = await getPool().query(
    `SELECT z.id, z.drukkerId, z.verzondenOp, z.bestellingIds, d.naam AS drukkerNaam
     FROM drukkerZendingen z
     JOIN drukkers d ON d.id = z.drukkerId
     WHERE ${where}
     ORDER BY z.verzondenOp DESC`,
    ids
  );

  return NextResponse.json(
    (rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      bestellingIds:
        typeof row.bestellingIds === 'string' ? JSON.parse(row.bestellingIds) : row.bestellingIds,
    }))
  );
}
