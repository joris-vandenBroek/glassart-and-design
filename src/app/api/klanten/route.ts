import { NextResponse } from 'next/server';
import { listRows } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

// Without this, Next.js statically caches this GET handler at build time (it's
// the only route in the API that exports GET with no other method and no
// request-dependent logic to trigger dynamic rendering automatically), so the
// klanten list would be frozen to its build-time snapshot in production.
export const dynamic = 'force-dynamic';

const KLANTEN_JSON_COLUMNS = ['exclusieveKunstenaarIds'];

export async function GET(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const klanten = await listRows('klanten', KLANTEN_JSON_COLUMNS);
  return NextResponse.json(klanten);
}
