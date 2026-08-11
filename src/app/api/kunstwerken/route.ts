import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import { codeIsInGebruik, codeKomtVoorInBestelling, isDuplicateCodeError } from '@/lib/server/kunstwerkCode';
import {
  DuplicateRelatieError,
  haalRelatiesOp,
  haalRelatiesOpVoorEen,
  scheidRelaties,
  vervangRelaties,
} from '@/lib/server/kunstwerkRelaties';

// Kunstwerken had een generieke CRUD-route via /api/[resource], maar heeft er drie
// eigen regels bij: een unieke code, een code die vastligt zodra er besteld is, en
// een verwijderslot. Dat is precies waarvoor CLAUDE.md de eigen-route-conventie
// beschrijft (klanten, kunstenaars en drukkers hebben die al).

// Publiek leesbaar, net als voorheen: de collectiepagina van de winkel haalt dit op
// zonder sessie.
export const GET = withApiErrorHandling('GET /api/kunstwerken', async () => {
  const rows = await listRows<{ id: string }>('kunstwerken');
  const relatiesPerKunstwerk = await haalRelatiesOp(
    getPool(),
    rows.map((row) => row.id)
  );
  const result = rows.map((row) => ({ ...row, ...relatiesPerKunstwerk.get(row.id) }));
  return NextResponse.json(result);
});

export const POST = withMedewerker('POST /api/kunstwerken', async (request: Request) => {
  const data = (await request.json()) as Record<string, unknown>;
  const code = typeof data.code === 'string' ? data.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'code-verplicht' }, { status: 400 });
  }
  // Ook een code die op dit moment op géén kunstwerk staat, maar al wel in bestellines
  // voorkomt, is bezet: het is de vrijgekomen code van een eerder verwijderd kunstwerk.
  // Wordt die code hier zonder controle uitgegeven, dan wijst de historische bestelregel
  // straks stil naar het verkeerde werk -- zie het commentaar bij DELETE
  // /api/kunstwerken/[id] voor waarom die controle hier moet staan en niet daar.
  if ((await codeIsInGebruik(code, null)) || (await codeKomtVoorInBestelling(code))) {
    return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
  }

  const { relaties, rest } = scheidRelaties(data);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const created = await insertRow<{ id: string }>('kunstwerken', { ...rest, code }, [], connection);
    await vervangRelaties(connection, created.id, relaties);
    await connection.commit();
    const volledig = await haalRelatiesOpVoorEen(getPool(), created.id);
    return NextResponse.json({ ...created, ...volledig }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    if (isDuplicateCodeError(error)) {
      return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
    }
    if (error instanceof DuplicateRelatieError) {
      return NextResponse.json({ error: 'dubbele-relatie', kolom: error.kolom }, { status: 400 });
    }
    throw error;
  } finally {
    connection.release();
  }
});
