import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { LOOKUP_RESOURCES } from '@/lib/server/lookupResources';
import { requireMedewerker } from '@/lib/server/requireAuth';

export async function GET(request: Request, { params }: { params: { resource: string } }) {
  const config = LOOKUP_RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  if (config.authRequired && !(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await listRows(params.resource, config.jsonColumns);
  return NextResponse.json(rows);
}

export async function POST(request: Request, { params }: { params: { resource: string } }) {
  const config = LOOKUP_RESOURCES[params.resource];
  if (!config) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  if (config.authRequired && !(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    const created = await insertRow(params.resource, data, config.jsonColumns);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
