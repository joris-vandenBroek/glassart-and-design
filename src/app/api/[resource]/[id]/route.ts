import { NextResponse } from 'next/server';
import { getRow, updateRow, deleteRow } from '@/lib/server/crud';
import { LOOKUP_RESOURCES } from '@/lib/server/lookupResources';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

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
    await deleteRow(params.resource, params.id);
    return NextResponse.json({ ok: true });
  }
);
