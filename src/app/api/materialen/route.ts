import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';

// Materialen had een generieke CRUD-route via /api/[resource], maar heeft er twee eigen
// regels bij: deactiveren mag niet zolang er openstaande bestellingen zijn, en bij
// activeren kan het materiaal in bulk aan alle kunstwerken gekoppeld worden. Dat is
// precies waarvoor CLAUDE.md de eigen-route-conventie beschrijft (kunstwerken, klanten,
// kunstenaars en drukkers hebben die al).

// Publiek leesbaar, net als voorheen: de winkel haalt dit op zonder sessie. Het filteren
// op `actief` gebeurt bewust in de UI en niet hier -- een historische bestelregel moet
// zijn materiaal blijven kunnen oplossen.
export const GET = withApiErrorHandling('GET /api/materialen', async () => {
  const rows = await listRows('materialen');
  return NextResponse.json(rows);
});

export const POST = withMedewerker('POST /api/materialen', async (request: Request) => {
  const data = (await request.json()) as Record<string, unknown>;
  const created = await insertRow('materialen', data);
  return NextResponse.json(created, { status: 201 });
});
