import { NextResponse } from 'next/server';
import { updateRow, deleteRow } from '@/lib/server/crud';
import { requireMedewerker, requireKlant } from '@/lib/server/requireAuth';

// Full-field admin edit (status, prijsgroepId, kunstenaarId, ...) -- staff only.
// A klant's own self-service edit goes through the narrowly-scoped /api/klanten/me instead.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    await updateRow('klanten', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

// Staff can delete any klant; a klant can delete their own account (SettingsSection
// re-verifies the password via /api/auth/login before calling this).
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const medewerkerId = await requireMedewerker(request);
  const klantId = medewerkerId ? null : await requireKlant(request);
  if (!medewerkerId && klantId !== params.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await deleteRow('klanten', params.id);
  return NextResponse.json({ ok: true });
}
