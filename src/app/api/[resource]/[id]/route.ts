import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { LOOKUP_RESOURCES } from '@/lib/server/lookupResources';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

const BESTELLING_REFERENCE_COLUMN: Record<string, string> = {
  maten: 'maatId',
  materialen: 'materiaalId',
};

// Same "still in use" principle as BESTELLING_REFERENCE_COLUMN above, but against another
// lookup table instead of real bestellingen -- materiaalsoorten/prijsgroepen previously had
// no server-side guard at all (only a client-side pre-check against already-loaded data in
// MateriaalsoortenSection.tsx/PrijsgroepenSection.tsx), so a direct API call or stale client
// state could silently orphan the reference.
const LOOKUP_REFERENCE: Record<string, { table: string; column: string }> = {
  materiaalsoorten: { table: 'materialen', column: 'materiaalsoortId' },
  prijsgroepen: { table: 'klanten', column: 'prijsgroepId' },
};

export const GET = withApiErrorHandling(
  'GET /api/[resource]/[id]',
  async (request: Request, { params }: { params: { resource: string; id: string } }) => {
    const config = LOOKUP_RESOURCES[params.resource];
    if (!config) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 });
    }
    if (config.readAuthRequired && !(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const row = await getRow(params.resource, params.id, config.jsonColumns);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json(row);
  }
);

export const PATCH = withApiErrorHandling(
  'PATCH /api/[resource]/[id]',
  async (request: Request, { params }: { params: { resource: string; id: string } }) => {
    const config = LOOKUP_RESOURCES[params.resource];
    if (!config) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 });
    }
    if (config.writeAuthRequired && !(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const data = await request.json();
    await updateRow(params.resource, params.id, data, config.jsonColumns);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiErrorHandling(
  'DELETE /api/[resource]/[id]',
  async (request: Request, { params }: { params: { resource: string; id: string } }) => {
    const config = LOOKUP_RESOURCES[params.resource];
    if (!config) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 });
    }
    if (config.writeAuthRequired && !(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const column = BESTELLING_REFERENCE_COLUMN[params.resource];
    if (column) {
      const [rows] = await getPool().query(`SELECT 1 FROM bestellines WHERE ${column} = ? LIMIT 1`, [params.id]);
      if ((rows as unknown[]).length > 0) {
        return NextResponse.json({ error: 'in-use-bestelling' }, { status: 409 });
      }
    }
    const reference = LOOKUP_REFERENCE[params.resource];
    if (reference) {
      const [rows] = await getPool().query(
        `SELECT 1 FROM \`${reference.table}\` WHERE \`${reference.column}\` = ? LIMIT 1`,
        [params.id]
      );
      if ((rows as unknown[]).length > 0) {
        return NextResponse.json({ error: 'in-use' }, { status: 409 });
      }
    }
    await deleteRow(params.resource, params.id);
    return NextResponse.json({ ok: true });
  }
);
