import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import {
  KUNSTWERKEN_JSON_COLUMNS,
  codeIsInGebruik,
  codeKomtVoorInBestelling,
  codeKomtVoorInBestellingForUpdate,
  isDuplicateCodeError,
} from '@/lib/server/kunstwerkCode';

export const GET = withApiErrorHandling(
  'GET /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const row = await getRow('kunstwerken', params.id, KUNSTWERKEN_JSON_COLUMNS);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json(row);
  }
);

export const PATCH = withMedewerker(
  'PATCH /api/kunstwerken/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    const bestaand = await getRow<{ code: string }>('kunstwerken', params.id);
    if (!bestaand) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    const data = (await request.json()) as Record<string, unknown>;
    if ('code' in data) {
      if (typeof data.code !== 'string' || !data.code.trim()) {
        return NextResponse.json({ error: 'code-verplicht' }, { status: 400 });
      }
      const nieuweCode = data.code.trim();
      // Exacte vergelijking, niet hoofdletterongevoelig: ook een wijziging die alleen
      // de schrijfwijze aanpast is een codewijziging. Anders zouden de code in
      // kunstwerken en de code in bestellines in schrijfwijze uit elkaar lopen.
      if (nieuweCode !== bestaand.code) {
        // De code van een besteld werk ligt vast: hij staat in bestellines en is
        // mogelijk al bij de drukker en in een masterbestand terechtgekomen.
        if (await codeKomtVoorInBestelling(bestaand.code)) {
          return NextResponse.json({ error: 'code-in-bestelling' }, { status: 409 });
        }
        if (await codeIsInGebruik(nieuweCode, params.id)) {
          return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
        }
      }
      data.code = nieuweCode;
    }

    try {
      await updateRow('kunstwerken', params.id, data, KUNSTWERKEN_JSON_COLUMNS);
    } catch (error) {
      if (isDuplicateCodeError(error)) {
        return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withMedewerker(
  'DELETE /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const bestaand = await getRow<{ code: string }>('kunstwerken', params.id);
    if (!bestaand) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    // Check en verwijdering in één transactie, met FOR UPDATE op de check: zo kan een
    // bestelling die tussen de check en de verwijdering in zou committeren niet meer
    // langs dit slot glippen. Een gewone SELECT (zoals PATCH hierboven nog gebruikt)
    // neemt geen slot op een rij die nog niet bestaat en garandeert dat niet -- zie
    // codeKomtVoorInBestellingForUpdate. Zonder dit slot kan een code vrijkomen en
    // later aan een nieuw kunstwerk gegeven worden, waarna historische bestelregels
    // stil naar het verkeerde werk wijzen. Zelfde foutcode als de generieke route al
    // gebruikt voor maten en materialen.
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (await codeKomtVoorInBestellingForUpdate(bestaand.code, connection)) {
        await connection.rollback();
        return NextResponse.json({ error: 'in-use-bestelling' }, { status: 409 });
      }
      await deleteRow('kunstwerken', params.id, connection);
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
