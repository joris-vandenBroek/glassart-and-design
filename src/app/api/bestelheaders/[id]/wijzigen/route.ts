import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';
import { insertRow, updateRow, deleteRow } from '@/lib/server/crud';
import { resolveerBestellijnPrijs, statusVoorFout } from '@/lib/server/bestellijnPrijsResolver';

const REGELSTRUCTUUR_OP_SLOT_STATUSSEN = ['Verstuurd naar drukker', 'Te factureren', 'Betaald en afgerond'];
const UPDATE_VELDEN = ['quantity', 'prijs', 'materiaalId', 'maatId', 'breedte', 'hoogte'] as const;
type UpdateVeld = (typeof UPDATE_VELDEN)[number];

interface UpdateInput {
  id: string;
  quantity?: number;
  prijs?: number | null;
  materiaalId?: string;
  maatId?: string;
  breedte?: number;
  hoogte?: number;
}

interface AdditionInput {
  kunstwerkId: string;
  materiaalId: string;
  maatId: string;
  breedte?: number;
  hoogte?: number;
  quantity: number;
}

interface WijzigenBody {
  korting?: number | null;
  updates?: UpdateInput[];
  additions?: AdditionInput[];
  deletions?: string[];
}

// Een update-item dat alléén `prijs` bevat blijft toegestaan zodra de regelstructuur op
// slot zit -- "prijs vaststellen"/"handmatig corrigeren" mag altijd, zie de design-beslissing 2.
function heeftAlleenPrijs(update: UpdateInput): boolean {
  return UPDATE_VELDEN.filter((veld) => veld !== 'prijs').every((veld) => update[veld as UpdateVeld] === undefined);
}

export const PATCH = withMedewerker<{ params: { id: string } }>(
  'PATCH /api/bestelheaders/[id]/wijzigen',
  async (request, { params }) => {
    const body = (await request.json()) as WijzigenBody;
    const updates = body.updates ?? [];
    const additions = body.additions ?? [];
    const deletions = body.deletions ?? [];

    const pool = getPool();
    const [headerRows] = await pool.query('SELECT bestelnr, status, klantnr FROM bestelheaders WHERE id = ?', [
      params.id,
    ]);
    const header = (headerRows as Array<{ bestelnr: string; status: string; klantnr: string }>)[0];
    if (!header) {
      return NextResponse.json({ error: 'niet-gevonden' }, { status: 404 });
    }
    if (header.status === 'Afgewezen') {
      return NextResponse.json({ error: 'bestelling-op-slot' }, { status: 400 });
    }
    if (REGELSTRUCTUUR_OP_SLOT_STATUSSEN.includes(header.status)) {
      const heeftRegelstructuurWijziging =
        additions.length > 0 || deletions.length > 0 || updates.some((update) => !heeftAlleenPrijs(update));
      if (heeftRegelstructuurWijziging) {
        return NextResponse.json({ error: 'regelstructuur-op-slot' }, { status: 400 });
      }
    }

    // klantId (UUID) is nodig voor berekenBestellijnPrijs's prijsgroep-opzoeking -- bestelheaders
    // zelf staat op klantnr, dus die wordt hier één keer vertaald.
    const [klantRows] = await pool.query('SELECT id FROM klanten WHERE klantnr = ?', [header.klantnr]);
    const klantId = (klantRows as Array<{ id: string }>)[0]?.id ?? null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const idsOmTeControleren = [...updates.map((u) => u.id), ...deletions];
      if (idsOmTeControleren.length > 0) {
        const [rows] = await connection.query('SELECT id FROM bestellines WHERE id IN (?) AND bestelnr = ?', [
          idsOmTeControleren,
          header.bestelnr,
        ]);
        const gevonden = new Set((rows as Array<{ id: string }>).map((r) => r.id));
        if (idsOmTeControleren.some((id) => !gevonden.has(id))) {
          await connection.rollback();
          return NextResponse.json({ error: 'regel-hoort-niet-bij-bestelling' }, { status: 400 });
        }
      }

      const [countRows] = await connection.query('SELECT COUNT(*) AS n FROM bestellines WHERE bestelnr = ?', [
        header.bestelnr,
      ]);
      const huidigAantal = (countRows as Array<{ n: number }>)[0].n;
      if (huidigAantal - deletions.length + additions.length < 1) {
        await connection.rollback();
        return NextResponse.json({ error: 'bestelling-mag-niet-leeg' }, { status: 400 });
      }

      for (const update of updates) {
        if (update.quantity !== undefined && (!Number.isInteger(update.quantity) || update.quantity <= 0)) {
          await connection.rollback();
          return NextResponse.json({ error: 'invalid-quantity' }, { status: 400 });
        }
        if (update.prijs !== undefined) {
          const geldigePrijs =
            update.prijs === null ||
            (typeof update.prijs === 'number' && Number.isFinite(update.prijs) && update.prijs > 0);
          if (!geldigePrijs) {
            await connection.rollback();
            return NextResponse.json({ error: 'invalid-prijs' }, { status: 400 });
          }
        }
        for (const veld of ['breedte', 'hoogte'] as const) {
          const waarde = update[veld];
          if (waarde !== undefined && (!Number.isInteger(waarde) || waarde <= 0)) {
            await connection.rollback();
            return NextResponse.json({ error: 'invalid-afmeting' }, { status: 400 });
          }
        }

        const patch: Record<string, unknown> = {};
        for (const veld of UPDATE_VELDEN) {
          if (update[veld] !== undefined) patch[veld] = update[veld];
        }
        if (Object.keys(patch).length > 0) {
          await updateRow('bestellines', update.id, patch, [], connection);
        }
      }

      // Elke addition dezelfde validatie/prijsberekening als POST /api/bestelheaders en de
      // prijsvoorbeeld-route -- zie resolveerBestellijnPrijs in bestellijnPrijsResolver.ts.
      for (const addition of additions) {
        if (!Number.isInteger(addition.quantity) || addition.quantity <= 0) {
          await connection.rollback();
          return NextResponse.json({ error: 'invalid-quantity' }, { status: 400 });
        }
        const resultaat = await resolveerBestellijnPrijs(connection, addition, klantId);
        if (resultaat.status === 'fout') {
          await connection.rollback();
          return NextResponse.json({ error: resultaat.error }, { status: statusVoorFout(resultaat.error) });
        }

        await insertRow(
          'bestellines',
          {
            bestelnr: header.bestelnr,
            code: resultaat.code,
            maatId: addition.maatId,
            materiaalId: addition.materiaalId,
            prijs: resultaat.status === 'vast' ? resultaat.prijs : null,
            quantity: addition.quantity,
            breedte: addition.breedte ?? null,
            hoogte: addition.hoogte ?? null,
          },
          [],
          connection
        );
      }

      for (const lineId of deletions) {
        await deleteRow('bestellines', lineId, connection);
      }

      if (body.korting !== undefined) {
        const geldigeKorting =
          body.korting === null ||
          (typeof body.korting === 'number' && Number.isFinite(body.korting) && body.korting >= 0);
        if (!geldigeKorting) {
          await connection.rollback();
          return NextResponse.json({ error: 'invalid-korting' }, { status: 400 });
        }
        await updateRow('bestelheaders', params.id, { korting: body.korting }, [], connection);
      }

      const [lineRows] = await connection.query(
        'SELECT id, code, maatId, materiaalId, prijs, quantity, breedte, hoogte FROM bestellines WHERE bestelnr = ?',
        [header.bestelnr]
      );
      const [kortingRows] = await connection.query('SELECT korting FROM bestelheaders WHERE id = ?', [params.id]);

      await connection.commit();

      return NextResponse.json({
        lines: lineRows,
        korting: (kortingRows as Array<{ korting: number | null }>)[0]?.korting ?? null,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
