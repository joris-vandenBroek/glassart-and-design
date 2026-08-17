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
    // blijven ongehinderd -- de regel beschermt lopende bestellingen, niet de rij.
    if ('actief' in data && !data.actief) {
      const [rows] = await getPool().query(
        `SELECT 1
         FROM bestellines bl
         JOIN bestelheaders bh ON bh.bestelnr = bl.bestelnr
         WHERE bl.materiaalId = ? AND bh.status NOT IN (?)
         LIMIT 1`,
        [params.id, AFGEHANDELDE_BESTELSTATUSSEN]
      );
      if ((rows as unknown[]).length > 0) {
        return NextResponse.json({ error: 'in-use-open-bestelling' }, { status: 409 });
      }
    }
    await updateRow('materialen', params.id, data);
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
