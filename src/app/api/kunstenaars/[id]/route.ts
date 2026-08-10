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
    // KunstenaarsSection.tsx already blocks this client-side against already-loaded
    // kunstwerken, but that's only a UX nicety -- without this, a direct API call (or
    // stale client state) would previously hit kunstwerken.kunstenaarId's unnamed FK
    // constraint as an uncaught exception instead of a clean response.
    const [rows] = await getPool().query('SELECT 1 FROM kunstwerken WHERE kunstenaarId = ? LIMIT 1', [
      params.id,
    ]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    await deleteRow('kunstenaars', params.id);
    return NextResponse.json({ ok: true });
  }
);
