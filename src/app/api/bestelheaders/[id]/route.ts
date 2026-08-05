import { NextResponse } from 'next/server';
import { getRow, updateRow } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';

interface Tijdstippen {
  teVersturenNaarDrukkerOp: Date | null;
  verstuurdNaarDrukkerOp: Date | null;
  afgewezenOp: Date | null;
}

const MONOTONE_STATUS_COLUMN: Record<string, keyof Tijdstippen> = {
  'Te versturen naar drukker': 'teVersturenNaarDrukkerOp',
  'Verstuurd naar drukker': 'verstuurdNaarDrukkerOp',
  Afgewezen: 'afgewezenOp',
};

// None of these timestamps are ever trusted from the client -- they're derived from
// `status` here. afgerondOp is symmetric (set on entering Afgerond, cleared on leaving
// it, so Terugzetten works). The other 3 are set-once/monotonic: a status can only
// acquire its timestamp the first time it's reached, and Terugzetten (Afgerond ->
// Verstuurd naar drukker) must not re-stamp verstuurdNaarDrukkerOp -- the order was
// never actually un-sent, only its completion was corrected.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const data = await request.json();
    if ('status' in data) {
      data.afgerondOp = data.status === 'Afgerond' ? new Date() : null;

      const column = MONOTONE_STATUS_COLUMN[data.status];
      if (column) {
        const current = await getRow<Tijdstippen>('bestelheaders', params.id);
        if (!current?.[column]) {
          data[column] = new Date();
        }
      }
    }
    await updateRow('bestelheaders', params.id, data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
