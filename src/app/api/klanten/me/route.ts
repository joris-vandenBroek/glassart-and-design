import { NextResponse } from 'next/server';
import { getRow, updateRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { requireKlant } from '@/lib/server/requireAuth';
import { hashPassword, valideerWachtwoord } from '@/lib/server/password';
import { SELF_EDITABLE_KLANT_FIELDS, normaliseerEmail } from '@/lib/server/klantFields';
import { checkBtwNummerUpdate } from '@/lib/server/btwNummerCheck';
import { sessionIdFromRequest } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

// email isn't in the shared registration allowlist (register/route.ts handles it
// separately via a uniqueness check) but a klant editing their own profile may change it.
const SELF_EDITABLE_FIELDS = [...SELF_EDITABLE_KLANT_FIELDS, 'email'] as const;

export const GET = withApiErrorHandling('GET /api/klanten/me', async (request: Request) => {
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // getRow laat wachtwoordHash zelf al weg (zie VERBORGEN_KOLOMMEN); dit blijft
  // staan zodat een fout in die registratie hier niet meteen een lek oplevert.
  const klant = await getRow<Record<string, unknown>>('klanten', klantId);
  if (!klant) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  const { wachtwoordHash: _wachtwoordHash, afwijsreden: _afwijsreden, ...safeKlant } = klant;
  return NextResponse.json(safeKlant);
});

export const PATCH = withApiErrorHandling('PATCH /api/klanten/me', async (request: Request) => {
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown> & { password?: string };
  const updates: Record<string, unknown> = {};
  for (const field of SELF_EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  // Het e-mailadres is hier bewerkbaar, maar de uniciteitscontrole die bij
  // registratie wél gebeurt ontbrak -- de UNIQUE-index in de database ving het
  // dan af als een 500 in plaats van een uitlegbare fout.
  if ('email' in updates) {
    const email = normaliseerEmail(updates.email);
    if (email === null) {
      return NextResponse.json({ error: 'email-ongeldig' }, { status: 400 });
    }
    const [bezet] = await getPool().query('SELECT id FROM klanten WHERE email = ? AND id != ?', [
      email,
      klantId,
    ]);
    if ((bezet as unknown[]).length > 0) {
      return NextResponse.json({ error: 'email-in-use' }, { status: 400 });
    }
    updates.email = email;
  }

  if ((await checkBtwNummerUpdate(updates, klantId)) === 'ongeldig') {
    return NextResponse.json({ error: 'btwnummer-ongeldig' }, { status: 400 });
  }

  const wachtwoordGewijzigd = typeof body.password === 'string' && body.password.length > 0;
  if (wachtwoordGewijzigd) {
    const wachtwoordFout = valideerWachtwoord(body.password);
    if (wachtwoordFout !== 'ok') {
      return NextResponse.json({ error: 'password-too-short' }, { status: 400 });
    }
    updates.wachtwoordHash = await hashPassword(body.password as string);
  }

  await updateRow('klanten', klantId, updates);

  if (wachtwoordGewijzigd) {
    // Alle ándere sessies van deze klant vervallen; de huidige blijft staan,
    // anders zou je jezelf uitloggen door je wachtwoord te wijzigen.
    const huidigeSessie = sessionIdFromRequest(request) ?? '';
    await getPool().query(
      'DELETE FROM sessions WHERE userType = ? AND userId = ? AND id != ?',
      ['klant', klantId, huidigeSessie]
    );
  }

  return NextResponse.json({ ok: true });
});
