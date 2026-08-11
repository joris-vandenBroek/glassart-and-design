import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

// Begrenst de IN(?)-lijst; een grotere selectie dan dit komt in de beheeromgeving
// niet voor en zou alleen een onbedoeld enorme query opleveren.
const MAX_IDS = 200;

export const GET = withMedewerker('GET /api/drukkerzendingen', async (request: Request) => {
  const raw = new URL(request.url).searchParams.get('bestellingIds') ?? '';
  const bestelnrs = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (bestelnrs.length === 0) {
    return NextResponse.json([]);
  }
  if (bestelnrs.length > MAX_IDS) {
    return NextResponse.json({ error: 'too-many-ids' }, { status: 400 });
  }

  const pool = getPool();
  const [zendingnummerRows] = await pool.query(
    'SELECT DISTINCT zendingnummer FROM drukkerZendingBestellingen WHERE bestelnr IN (?)',
    [bestelnrs]
  );
  const zendingnummers = (zendingnummerRows as Array<{ zendingnummer: string }>).map((r) => r.zendingnummer);
  if (zendingnummers.length === 0) {
    return NextResponse.json([]);
  }

  const [rows] = await pool.query(
    `SELECT z.id, z.zendingnummer, z.drukkernr, z.verzondenOp, d.naam AS drukkerNaam
     FROM drukkerZendingen z
     JOIN drukkers d ON d.drukkernr = z.drukkernr
     WHERE z.zendingnummer IN (?)
     ORDER BY z.verzondenOp DESC`,
    [zendingnummers]
  );
  const zendingen = rows as Array<Record<string, unknown> & { zendingnummer: string }>;

  const [koppelRows] = await pool.query(
    'SELECT zendingnummer, bestelnr FROM drukkerZendingBestellingen WHERE zendingnummer IN (?)',
    [zendingnummers]
  );
  const bestelnrsPerZending = new Map<string, string[]>();
  for (const row of koppelRows as Array<{ zendingnummer: string; bestelnr: string }>) {
    const bestaand = bestelnrsPerZending.get(row.zendingnummer);
    if (bestaand) {
      bestaand.push(row.bestelnr);
    } else {
      bestelnrsPerZending.set(row.zendingnummer, [row.bestelnr]);
    }
  }

  return NextResponse.json(
    zendingen.map((z) => ({ ...z, bestellingIds: bestelnrsPerZending.get(z.zendingnummer) ?? [] }))
  );
});
