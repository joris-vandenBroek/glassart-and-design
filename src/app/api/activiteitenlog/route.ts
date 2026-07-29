import { NextResponse } from 'next/server';
import { insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { ACTIVITEIT_TYPES } from '@/lib/logActiviteit';
import { requireMedewerker } from '@/lib/server/requireAuth';

// Deliberately open -- both anonymous visitors (e.g. word_klant_bezocht) and logged-in
// customers/staff log their own events here, so this can't require a medewerker session.
export async function POST(request: Request) {
  const data = await request.json();
  if (!ACTIVITEIT_TYPES.includes(data.type)) {
    return NextResponse.json({ error: 'invalid-type' }, { status: 400 });
  }
  try {
    await insertRow('activiteitenlog', data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}

// The log records real actorEmail/actorNaam for every customer and staff action --
// reading it back is a staff-only audit view.
export async function GET(request: Request) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT * FROM activiteitenlog ORDER BY timestamp DESC LIMIT 500'
  );
  return NextResponse.json(rows);
}
