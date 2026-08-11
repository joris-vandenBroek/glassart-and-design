import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import {
  codeIsInGebruik,
  codeKomtVoorInBestelling,
  codeKomtVoorInBestellingForUpdate,
  isDuplicateCodeError,
} from '@/lib/server/kunstwerkCode';
import {
  DuplicateRelatieError,
  haalRelatiesOpVoorEen,
  scheidRelaties,
  vervangRelaties,
} from '@/lib/server/kunstwerkRelaties';

export const GET = withApiErrorHandling(
  'GET /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const row = await getRow<{ id: string }>('kunstwerken', params.id);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    const relaties = await haalRelatiesOpVoorEen(getPool(), params.id);
    return NextResponse.json({ ...row, ...relaties });
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
        // Ook een code die op dit moment op géén kunstwerk staat, maar wel al in
        // bestellines voorkomt, is bezet: het is de vrijgekomen code van een eerder
        // verwijderd kunstwerk. Zie het commentaar bij DELETE hierboven en bij
        // codeKomtVoorInBestellingForUpdate voor de grens van deze controle: ze
        // voorkomt hergebruik van een code die al gecommit in bestellines staat, maar
        // niet de driewegs-race met een bestelling die haar eigen bestellines-INSERT
        // nog niet heeft gedaan.
        if ((await codeIsInGebruik(nieuweCode, params.id)) || (await codeKomtVoorInBestelling(nieuweCode))) {
          return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
        }
      }
      data.code = nieuweCode;
    }

    const { relaties, rest } = scheidRelaties(data);
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (Object.keys(rest).length > 0) {
        await updateRow('kunstwerken', params.id, rest, [], connection);
      }
      await vervangRelaties(connection, params.id, relaties);
      await connection.commit();
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
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withMedewerker(
  'DELETE /api/kunstwerken/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const bestaand = await getRow<{ code: string }>('kunstwerken', params.id);
    if (!bestaand) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    // Check en verwijdering in één transactie, met FOR UPDATE op de check: dat sluit de
    // interleaving waarin een bestelling haar bestellines-INSERT al onderweg heeft (nog
    // niet gecommit) wanneer deze check draait -- die INSERT houdt het rijslot vast, en
    // het is déze check die daarop wacht, niet andersom. De bestelling zelf loopt
    // ongehinderd door en committeert gewoon, volledig onaangetast door deze
    // verwijderpoging; pas ná die commit komt deze check los, ziet ze de rij alsnog, met
    // 409 tot gevolg. Het sluit niét de omgekeerde volgorde: draait deze
    // transactie eerst, dan committeert ze binnen milliseconden, en een bestelling die
    // vlak daarna zijn INSERT doet gaat gewoon door -- POST /api/bestelheaders leest het
    // kunstwerk met een gewone, niet-blokkerende SELECT en valideert niet opnieuw vlak
    // voor het schrijven. Er kan dus alsnog een bestellines-rij overblijven waarvan geen
    // kunstwerk meer de code draagt. Dat is geen gat: het ontwerp
    // (docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md, beslissing 3) accepteert
    // dat bewust -- een bestelregel legt de code vast als historische waarde, geen
    // verwijzing, vandaar geen foreign key. Wat wél moet blijven gelden is dat zo'n
    // vrijgekomen code nooit aan een ánder kunstwerk gegeven wordt, en dát wordt niet hier
    // maar bij het uitgeven bewaakt: zie codeKomtVoorInBestelling in POST /api/kunstwerken
    // en PATCH /api/kunstwerken/[id]. Zelfde foutcode als de generieke route al gebruikt
    // voor maten en materialen.
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
