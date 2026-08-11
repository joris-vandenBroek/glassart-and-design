import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

export const GET = withMedewerker<Context>(
  'GET /api/drukkers/[id]',
  async (_request, { params }) => {
    const row = await getRow<{ id: string; standaard?: boolean }>('drukkers', params.id);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ ...row, standaard: Boolean(row.standaard) });
  }
);

export const PATCH = withMedewerker<Context>(
  'PATCH /api/drukkers/[id]',
  async (request, { params }) => {
    // Zie POST: het nummer is server-eigendom en ligt na uitgifte vast.
    const { drukkernr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
    if (data.standaard) {
      await getPool().query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE AND id != ?', [
        params.id,
      ]);
    }
    await updateRow('drukkers', params.id, data);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withMedewerker<Context>(
  'DELETE /api/drukkers/[id]',
  async (_request, { params }) => {
    const bestaand = await getRow<{ drukkernr: string }>('drukkers', params.id);
    if (!bestaand) return NextResponse.json({ ok: true });
    // De foreign key van drukkerZendingen weigert dit sinds de drukkernummer-migratie
    // (geen cascade meer). Deze controle maakt er een nette 409 van in plaats van een
    // onafgevangen FK-fout. DrukkerModal.tsx blokkeert het ook al client-side.
    const [rows] = await getPool().query('SELECT 1 FROM drukkerZendingen WHERE drukkernr = ? LIMIT 1', [
      bestaand.drukkernr,
    ]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    await deleteRow('drukkers', params.id);
    return NextResponse.json({ ok: true });
  }
);
