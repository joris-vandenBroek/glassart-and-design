import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { checkBtwNummerUpdate } from '@/lib/server/btwNummerCheck';
import { volgendNummer } from '@/lib/server/counters';

type KlantnummerToekenningResultaat =
  | { gevonden: false }
  | { gevonden: true; klantnr: string };

/**
 * Voert de update uit én kent, indien nodig, een klantnummer toe -- alles binnen
 * één transactie. `SELECT ... FOR UPDATE` vergrendelt de klantrij, zodat twee
 * gelijktijdige goedkeuringen (dubbelklik, twee medewerkers) niet allebei een
 * nummer uitdelen: wie al een nummer heeft, houdt het.
 *
 * `updateRow()` krijgt de transactie-connection mee: die stond hier eerder met
 * de hand nagebouwd omdat `updateRow` alleen op de pool draaide, maar daarmee
 * liep deze update ook langs de kolomcontrole heen die elke andere schrijfactie
 * wél passeert.
 */
async function updateEnKenKlantnummerToe(
  id: string,
  data: Record<string, unknown>
): Promise<KlantnummerToekenningResultaat> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT klantnr FROM klanten WHERE id = ? FOR UPDATE', [id]);
    const rij = (rows as Array<{ klantnr: string | null }>)[0];
    if (!rij) {
      // Onbekende klant: niets bijwerken en vooral geen nummer verbruiken.
      await connection.rollback();
      return { gevonden: false };
    }

    const klantnr = rij.klantnr || (await volgendNummer(connection, 'klantnummer', 'KL-'));

    await updateRow('klanten', id, { ...data, klantnr }, [], connection);

    await connection.commit();
    return { gevonden: true, klantnr };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Full-field admin edit (status, prijsgroepId, kunstenaarnr, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export const PATCH = withApiErrorHandling(
  'PATCH /api/klanten/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const data = await request.json();
    if ((await checkBtwNummerUpdate(data, params.id)) === 'ongeldig') {
      return NextResponse.json({ error: 'btwnummer-ongeldig' }, { status: 400 });
    }
    if (data.status === 'Goedgekeurd') {
      const resultaat = await updateEnKenKlantnummerToe(params.id, data);
      if (!resultaat.gevonden) {
        return NextResponse.json({ error: 'klant-niet-gevonden' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, klantnr: resultaat.klantnr });
    }
    await updateRow('klanten', params.id, data);
    return NextResponse.json({ ok: true });
  }
);

// Staff can delete any klant; a klant can delete their own account (SettingsSection
// re-verifies the password via /api/auth/login before calling this). Self-service deletion
// is additionally blocked whenever the klant has any bestelheaders row (open or closed) --
// staff deletion is not subject to this check.
export const DELETE = withApiErrorHandling(
  'DELETE /api/klanten/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    const medewerkerId = await requireMedewerker(request);
    const klantId = medewerkerId ? null : await requireKlant(request);
    if (!medewerkerId && klantId !== params.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (klantId) {
      // bestelheaders verwijst sinds taak 2 naar klantnr, niet meer naar de klant-UUID --
      // dus eerst de klantnr van deze klant opzoeken, net als GET /api/bestelheaders doet.
      const [klantRows] = await getPool().query('SELECT klantnr FROM klanten WHERE id = ?', [klantId]);
      const klantnr = (klantRows as Array<{ klantnr: string | null }>)[0]?.klantnr;
      if (klantnr) {
        const [rows] = await getPool().query('SELECT 1 FROM bestelheaders WHERE klantnr = ? LIMIT 1', [klantnr]);
        if ((rows as unknown[]).length > 0) {
          return NextResponse.json({ error: 'heeft-bestellingen' }, { status: 409 });
        }
      }
    }
    await deleteRow('klanten', params.id);
    return NextResponse.json({ ok: true });
  }
);
