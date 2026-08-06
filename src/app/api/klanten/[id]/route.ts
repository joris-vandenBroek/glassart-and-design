import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

// Full-field admin edit (status, prijsgroepId, kunstenaarId, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export const PATCH = withApiErrorHandling(
  'PATCH /api/klanten/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const data = await request.json();
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
