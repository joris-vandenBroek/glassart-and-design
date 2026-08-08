import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { checkBtwNummerUpdate } from '@/lib/server/btwNummerCheck';

const KLANTNR_PADDING = 5;

/**
 * Voert de update uit én kent, indien nodig, een klantnummer toe -- alles binnen
 * één transactie. `SELECT ... FOR UPDATE` vergrendelt de klantrij, zodat twee
 * gelijktijdige goedkeuringen (dubbelklik, twee medewerkers) niet allebei een
 * nummer uitdelen: wie al een nummer heeft, houdt het.
 *
 * Bewust niet via `updateRow()`: die draait op de pool en zou dus buiten deze
 * transactie vallen. De SQL hieronder is een kopie van `updateRow` zonder de
 * JSON-serialisatie -- `klanten` heeft geen JSON-kolommen.
 */
async function updateEnKenKlantnummerToe(
  id: string,
  data: Record<string, unknown>
): Promise<string | null> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT klantnr FROM klanten WHERE id = ? FOR UPDATE', [id]);
    const rij = (rows as Array<{ klantnr: string | null }>)[0];
    if (!rij) {
      // Onbekende klant: niets bijwerken en vooral geen nummer verbruiken.
      await connection.rollback();
      return null;
    }

    let klantnr = rij.klantnr;
    if (!klantnr) {
      await connection.query('UPDATE counters SET value = value + 1 WHERE id = ?', ['klantnummer']);
      const [valueRows] = await connection.query('SELECT value FROM counters WHERE id = ?', [
        'klantnummer',
      ]);
      const nextValue = (valueRows as Array<{ value: number }>)[0].value;
      klantnr = `KL-${String(nextValue).padStart(KLANTNR_PADDING, '0')}`;
    }

    const velden: Record<string, unknown> = { ...data, klantnr };
    const kolommen = Object.keys(velden);
    const assignments = kolommen.map((kolom) => `\`${kolom}\` = ?`).join(', ');
    await connection.query(`UPDATE klanten SET ${assignments} WHERE id = ?`, [
      ...kolommen.map((kolom) => velden[kolom]),
      id,
    ]);

    await connection.commit();
    return klantnr;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Full-field admin edit (status, prijsgroepId, kunstenaarId, ...) -- staff only.
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
      const klantnr = await updateEnKenKlantnummerToe(params.id, data);
      return NextResponse.json({ ok: true, klantnr });
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
      const [rows] = await getPool().query('SELECT 1 FROM bestelheaders WHERE klantId = ? LIMIT 1', [klantId]);
      if ((rows as unknown[]).length > 0) {
        return NextResponse.json({ error: 'heeft-bestellingen' }, { status: 409 });
      }
    }
    await deleteRow('klanten', params.id);
    return NextResponse.json({ ok: true });
  }
);
