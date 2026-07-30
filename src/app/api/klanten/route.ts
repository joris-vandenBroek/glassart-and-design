import { NextResponse } from 'next/server';
import { listRows } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

// Without this, Next.js statically caches this GET handler at build time (it's
// the only route in the API that exports GET with no other method and no
// request-dependent logic to trigger dynamic rendering automatically), so the
// klanten list would be frozen to its build-time snapshot in production.
export const dynamic = 'force-dynamic';

export const GET = withApiErrorHandling('GET /api/klanten', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const klanten = await listRows('klanten');
  return NextResponse.json(klanten);
});
