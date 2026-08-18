import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import { AFGEHANDELDE_BESTELSTATUSSEN } from '@/lib/bestelStatus';

type Context = { params: { id: string } };

export const GET = withApiErrorHandling<Context>(
  'GET /api/materialen/[id]',
  async (_request: Request, { params }: Context) => {
    const row = await getRow('materialen', params.id);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json(row);
  }
);

export const PATCH = withMedewerker<Context>(
  'PATCH /api/materialen/[id]',
  async (request: Request, { params }: Context) => {
    const data = (await request.json()) as Record<string, unknown>;
    // Alleen bij het uitzetten van de vlag. Activeren en gewone veldwijzigingen
    // blijven ongehinderd -- de regels hieronder beschermen lopende bestellingen en
    // de bestelbaarheid van kunstwerken, niet de rij zelf.
    const wordtGedeactiveerd = 'actief' in data && !data.actief;
    if (wordtGedeactiveerd) {
      const [bestellingen] = await getPool().query(
        `SELECT 1
         FROM bestellines bl
         JOIN bestelheaders bh ON bh.bestelnr = bl.bestelnr
         WHERE bl.materiaalId = ? AND bh.status NOT IN (?)
         LIMIT 1`,
        [params.id, AFGEHANDELDE_BESTELSTATUSSEN]
      );
      if ((bestellingen as unknown[]).length > 0) {
        return NextResponse.json({ error: 'in-use-open-bestelling' }, { status: 409 });
      }

      // Deactiveren koppelt het materiaal los bij alle kunstwerken (zie hieronder). Een
      // kunstwerk dat daardoor op nul materialen uitkomt zou stilzwijgend materiaalloos
      // worden -- de categorie van Akoestische stof, met een prijs uit kunstwerken.prijsPerM2
      // die bij een glaskunstwerk leeg is. Dat weigeren we, met dezelfde luidruchtigheid als
      // de bestellingcontrole hierboven.
      const [laatste] = await getPool().query(
        `SELECT COUNT(*) AS aantal FROM (
           SELECT km.kunstwerkId
           FROM kunstwerkMaterialen km
           JOIN materialen m ON m.id = km.materiaalId
           WHERE m.actief = TRUE
           GROUP BY km.kunstwerkId
           HAVING COUNT(*) = 1 AND MIN(km.materiaalId) = ?
         ) AS kunstwerkenMetAlleenDitMateriaal`,
        [params.id]
      );
      const aantal = Number((laatste as Array<{ aantal: number }>)[0]?.aantal ?? 0);
      if (aantal > 0) {
        return NextResponse.json({ error: 'laatste-materiaal', aantal }, { status: 409 });
      }
    }

    if (!wordtGedeactiveerd) {
      await updateRow('materialen', params.id, data);
      return NextResponse.json({ ok: true });
    }

    // Vlag en koppelingen horen bij elkaar: een half uitgevoerde deactivering zou een
    // materiaal opleveren dat inactief is maar nog overal aangevinkt staat, precies het
    // beeld dat deze wijziging weghaalt.
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM kunstwerkMaterialen WHERE materiaalId = ?', [params.id]);
      // Via updateRow en niet met de hand geschreven SQL, zodat de kolom-allowlist uit
      // tableColumns.ts ook op dit pad geldt.
      await updateRow('materialen', params.id, data, [], connection);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withMedewerker<Context>(
  'DELETE /api/materialen/[id]',
  async (_request: Request, { params }: Context) => {
    // Stond eerder als BESTELLING_REFERENCE_COLUMN in de generieke [resource]-route:
    // een materiaal waarnaar een bestellijn verwijst mag nooit verdwijnen, want die
    // regel resolvet zijn label uit deze tabel.
    const [rows] = await getPool().query('SELECT 1 FROM bestellines WHERE materiaalId = ? LIMIT 1', [params.id]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use-bestelling' }, { status: 409 });
    }
    await deleteRow('materialen', params.id);
    return NextResponse.json({ ok: true });
  }
);
