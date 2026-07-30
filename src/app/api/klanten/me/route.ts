import { NextResponse } from 'next/server';
import { getRow, updateRow } from '@/lib/server/crud';
import { requireKlant } from '@/lib/server/requireAuth';
import { hashPassword } from '@/lib/server/password';
import { SELF_EDITABLE_KLANT_FIELDS } from '@/lib/server/klantFields';

// email isn't in the shared registration allowlist (register/route.ts handles it
// separately via a uniqueness check) but a klant editing their own profile may change it.
const SELF_EDITABLE_FIELDS = [...SELF_EDITABLE_KLANT_FIELDS, 'email'] as const;

export async function GET(request: Request) {
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const klant = await getRow<Record<string, unknown>>('klanten', klantId);
  if (!klant) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  const { wachtwoordHash: _wachtwoordHash, ...safeKlant } = klant;
  return NextResponse.json(safeKlant);
}

export async function PATCH(request: Request) {
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown> & { password?: string };
  const updates: Record<string, unknown> = {};
  for (const field of SELF_EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'password-too-short' }, { status: 400 });
    }
    updates.wachtwoordHash = await hashPassword(body.password);
  }

  try {
    await updateRow('klanten', klantId, updates);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
