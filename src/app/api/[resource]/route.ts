import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { LOOKUP_RESOURCES } from '@/lib/server/lookupResources';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling(
  'GET /api/[resource]',
  async (request: Request, { params }: { params: { resource: string } }) => {
    const config = LOOKUP_RESOURCES[params.resource];
    if (!config) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 });
    }
    if (config.readAuthRequired && !(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const rows = await listRows(params.resource, config.jsonColumns);
    return NextResponse.json(rows);
  }
);

export const POST = withApiErrorHandling(
  'POST /api/[resource]',
  async (request: Request, { params }: { params: { resource: string } }) => {
    const config = LOOKUP_RESOURCES[params.resource];
    if (!config) {
      return NextResponse.json({ error: 'not-found' }, { status: 404 });
    }
    if (config.writeAuthRequired && !(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const data = await request.json();
    const created = await insertRow(params.resource, data, config.jsonColumns);
    return NextResponse.json(created, { status: 201 });
  }
);
