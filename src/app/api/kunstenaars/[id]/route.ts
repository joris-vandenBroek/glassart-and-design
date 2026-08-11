import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { redigeerExclusieveKlantIds } from '@/lib/server/kunstenaarZichtbaarheid';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

const KUNSTENAARS_JSON_COLUMNS = ['exclusieveKlantIds'];

export const GET = withApiErrorHandling(
  'GET /api/kunstenaars/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    const row = await getRow<{ exclusieveKlantIds?: string[] }>(
      'kunstenaars',
      params.id,
      KUNSTENAARS_JSON_COLUMNS
    );
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    if ((await requireMedewerker(request)) !== null) {
      return NextResponse.json(row);
    }
    const klantId = await requireKlant(request);
    return NextResponse.json({
      ...row,
      exclusieveKlantIds: redigeerExclusieveKlantIds(row.exclusieveKlantIds, klantId),
    });
  }
);

export const PATCH = withApiErrorHandling(
  'PATCH /api/kunstenaars/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    // Zie POST: het nummer is server-eigendom en ligt na uitgifte vast.
    const { kunstenaarnr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
    await updateRow('kunstenaars', params.id, data, KUNSTENAARS_JSON_COLUMNS);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrorHandling(
  'DELETE /api/kunstenaars/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const bestaand = await getRow<{ kunstenaarnr: string }>('kunstenaars', params.id);
    // Geen rij: niets te doen, en de aanroeper krijgt hetzelfde antwoord als voorheen.
    if (!bestaand) return NextResponse.json({ ok: true });

    // KunstenaarsSection.tsx blokkeert dit ook al aan de clientkant, maar dat is een
    // UX-nicety: zonder deze twee controles zou een directe API-aanroep (of verouderde
    // schermstatus) op de foreign keys van kunstwerken en klanten stuklopen als
    // onafgevangen fout in plaats van een nette 409.
    const [kunstwerkRows] = await getPool().query(
      'SELECT 1 FROM kunstwerken WHERE kunstenaarnr = ? LIMIT 1',
      [bestaand.kunstenaarnr]
    );
    if ((kunstwerkRows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    const [klantRows] = await getPool().query('SELECT 1 FROM klanten WHERE kunstenaarnr = ? LIMIT 1', [
      bestaand.kunstenaarnr,
    ]);
    if ((klantRows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }

    await deleteRow('kunstenaars', params.id);
    return NextResponse.json({ ok: true });
  }
);
