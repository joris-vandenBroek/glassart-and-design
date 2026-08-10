import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { withApiErrorHandling, withMedewerker } from '@/lib/server/apiRoute';
import {
  KUNSTWERKEN_JSON_COLUMNS,
  codeIsInGebruik,
  isDuplicateCodeError,
} from '@/lib/server/kunstwerkCode';

// Kunstwerken had een generieke CRUD-route via /api/[resource], maar heeft er drie
// eigen regels bij: een unieke code, een code die vastligt zodra er besteld is, en
// een verwijderslot. Dat is precies waarvoor CLAUDE.md de eigen-route-conventie
// beschrijft (klanten, kunstenaars en drukkers hebben die al).

// Publiek leesbaar, net als voorheen: de collectiepagina van de winkel haalt dit op
// zonder sessie.
export const GET = withApiErrorHandling('GET /api/kunstwerken', async () => {
  const rows = await listRows('kunstwerken', KUNSTWERKEN_JSON_COLUMNS);
  return NextResponse.json(rows);
});

export const POST = withMedewerker('POST /api/kunstwerken', async (request: Request) => {
  const data = (await request.json()) as Record<string, unknown>;
  const code = typeof data.code === 'string' ? data.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'code-verplicht' }, { status: 400 });
  }
  if (await codeIsInGebruik(code, null)) {
    return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
  }
  try {
    const created = await insertRow('kunstwerken', { ...data, code }, KUNSTWERKEN_JSON_COLUMNS);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return NextResponse.json({ error: 'code-bestaat-al' }, { status: 409 });
    }
    throw error;
  }
});
