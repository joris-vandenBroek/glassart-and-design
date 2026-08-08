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
    const data = await request.json();
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
    // drukkerZendingen.drukkerId is ON DELETE CASCADE, so without this check a delete
    // would silently succeed and take real verzendhistorie (audit trail) down with it.
    // DrukkerModal.tsx already blocks this client-side against already-loaded zendingen,
    // but that's only a UX nicety against a direct API call or stale client state.
    const [rows] = await getPool().query('SELECT 1 FROM drukkerZendingen WHERE drukkerId = ? LIMIT 1', [
      params.id,
    ]);
    if ((rows as unknown[]).length > 0) {
      return NextResponse.json({ error: 'in-use' }, { status: 409 });
    }
    await deleteRow('drukkers', params.id);
    return NextResponse.json({ ok: true });
  }
);
