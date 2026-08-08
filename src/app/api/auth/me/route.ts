import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getRow } from '@/lib/server/crud';
import { validateSession, sessionIdFromRequest } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { prijsgroepVoorKlant } from '@/lib/server/prijsmodule';

export const GET = withApiErrorHandling('GET /api/auth/me', async (request: Request) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'klant';
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) {
    return NextResponse.json({ user: null });
  }
  const session = await validateSession(sessionId);
  if (!session || session.userType !== type) {
    return NextResponse.json({ user: null });
  }
  const table = type === 'klant' ? 'klanten' : 'medewerkers';
  const user = await getRow<Record<string, unknown>>(table, session.userId);
  if (!user) {
    return NextResponse.json({ user: null });
  }
  const { wachtwoordHash: _wachtwoordHash, ...safeUser } = user;
  if (type === 'klant') {
    // Exposed so the client can apply the customer's own korting/opslag to prices it
    // computes itself (e.g. the per-m2 preview for maatloze kunstwerken) -- prijsgroepId
    // itself is already part of safeUser, so this adds no new confidentiality exposure.
    safeUser.prijsgroep = await prijsgroepVoorKlant(getPool(), session.userId);
  }
  return NextResponse.json({ user: safeUser });
});
