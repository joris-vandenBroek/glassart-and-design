import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getRow, insertRow } from '@/lib/server/crud';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

export const GET = withMedewerker<Context>(
  'GET /api/drukkers/[id]/zendingen',
  async (_request, { params }) => {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT z.* FROM drukkerZendingen z
       JOIN drukkers d ON d.drukkernr = z.drukkernr
       WHERE d.id = ?
       ORDER BY z.verzondenOp DESC`,
      [params.id]
    );
    const zendingen = rows as Array<Record<string, unknown> & { zendingnummer: string }>;
    if (zendingen.length === 0) {
      return NextResponse.json([]);
    }

    const zendingnummers = zendingen.map((z) => z.zendingnummer);
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
  }
);

export const POST = withMedewerker<Context>(
  'POST /api/drukkers/[id]/zendingen',
  async (request, { params }) => {
    const drukker = await getRow<{ drukkernr: string }>('drukkers', params.id);
    if (!drukker) return NextResponse.json({ error: 'drukker-not-found' }, { status: 404 });

    const { bestellingIds, ...data } = (await request.json()) as {
      bestellingIds?: string[];
      zendingnummer: string;
      [key: string]: unknown;
    };
    const bestelnrs = bestellingIds ?? [];

    const pool = getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // drukkernr komt uit de URL, niet uit de body: een client kan zo geen zending onder
      // een andere drukker hangen. data mag een eigen drukkernr bevatten (de client stuurt
      // die niet, maar niets garandeert dat) -- die wordt hier altijd overschreven doordat
      // insertData's eigen drukkernr-key ná de spread komt.
      const insertData = { ...data, drukkernr: drukker.drukkernr };
      const created = await insertRow<{ id: string; zendingnummer: string }>(
        'drukkerZendingen',
        insertData,
        [],
        connection
      );
      for (const bestelnr of bestelnrs) {
        await connection.query(
          'INSERT INTO drukkerZendingBestellingen (zendingnummer, bestelnr) VALUES (?, ?)',
          [created.zendingnummer, bestelnr]
        );
      }
      await connection.commit();
      return NextResponse.json({ ...created, bestellingIds: bestelnrs }, { status: 201 });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
