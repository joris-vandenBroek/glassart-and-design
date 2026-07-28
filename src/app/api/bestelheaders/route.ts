import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import type { PoolConnection } from 'mysql2/promise';

const BESTELNR_PADDING = 5;

interface LineInput {
  kunstwerkId: string;
  maatId: string;
  materiaalId: string;
  prijs: number | null;
  quantity: number;
  breedte?: number;
  hoogte?: number;
}

function validateLine(line: LineInput): string | null {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    return 'invalid-quantity';
  }
  if (line.prijs !== null && (typeof line.prijs !== 'number' || line.prijs <= 0)) {
    return 'invalid-prijs';
  }
  return null;
}

// Mirrors src/lib/resolveOrderRight.ts, which is now a client-side UI hint only —
// this is the real enforcement, since there is no Firestore-rules layer anymore.
async function checkOrderRight(
  connection: PoolConnection,
  kunstwerkId: string,
  klantId: string
): Promise<boolean> {
  const [kunstwerkRows] = await connection.query(
    'SELECT kunstenaarId FROM kunstwerken WHERE id = ?',
    [kunstwerkId]
  );
  const kunstenaarId = (kunstwerkRows as Array<{ kunstenaarId: string | null }>)[0]?.kunstenaarId;
  if (!kunstenaarId) return true;

  const [kunstenaarRows] = await connection.query(
    'SELECT verkooprecht, klantId, exclusiefVoorKlantId FROM kunstenaars WHERE id = ?',
    [kunstenaarId]
  );
  const kunstenaar = (
    kunstenaarRows as Array<{ verkooprecht: string; klantId: string | null; exclusiefVoorKlantId: string | null }>
  )[0];
  if (!kunstenaar) return false;

  const isOwnArtwork = kunstenaar.klantId != null && kunstenaar.klantId === klantId;
  if (isOwnArtwork) return true;
  const isExclusiveToOther =
    kunstenaar.exclusiefVoorKlantId != null && kunstenaar.exclusiefVoorKlantId !== klantId;
  if (isExclusiveToOther) return false;
  const isArtistOnlyForOthers = kunstenaar.verkooprecht !== 'open';
  return !isArtistOnlyForOthers;
}

export async function POST(request: Request) {
  const { klantId, lines } = (await request.json()) as { klantId: string; lines: LineInput[] };

  for (const line of lines) {
    const validationError = validateLine(line);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const line of lines) {
      if (!(await checkOrderRight(connection, line.kunstwerkId, klantId))) {
        await connection.rollback();
        return NextResponse.json({ error: 'order-not-allowed' }, { status: 403 });
      }
    }

    const [counterRows] = await connection.query(
      'UPDATE counters SET value = value + 1 WHERE id = ?',
      ['bestelnummer']
    );
    void counterRows;
    const [valueRows] = await connection.query('SELECT value FROM counters WHERE id = ?', [
      'bestelnummer',
    ]);
    const nextValue = (valueRows as Array<{ value: number }>)[0].value;
    const bestelnr = `GD-${String(nextValue).padStart(BESTELNR_PADDING, '0')}`;

    const headerId = randomUUID();
    await connection.query(
      'INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)',
      [headerId, klantId, bestelnr, 'Te beoordelen']
    );

    for (const line of lines) {
      await connection.query(
        'INSERT INTO bestellines (id, bestelheaderId, kunstwerkId, maatId, materiaalId, prijs, quantity, breedte, hoogte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          headerId,
          line.kunstwerkId,
          line.maatId,
          line.materiaalId,
          line.prijs,
          line.quantity,
          line.breedte ?? null,
          line.hoogte ?? null,
        ]
      );
    }

    await connection.commit();
    return NextResponse.json({ id: headerId, bestelnr }, { status: 201 });
  } catch {
    await connection.rollback();
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  } finally {
    connection.release();
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const klantId = url.searchParams.get('klantId');
  const pool = getPool();

  const [headers] = klantId
    ? await pool.query('SELECT * FROM bestelheaders WHERE klantId = ?', [klantId])
    : await pool.query('SELECT * FROM bestelheaders');

  const result = await Promise.all(
    (headers as Array<Record<string, unknown>>).map(async (header) => {
      const [lines] = await pool.query('SELECT * FROM bestellines WHERE bestelheaderId = ?', [
        header.id,
      ]);
      return { ...header, lines };
    })
  );
  return NextResponse.json(result);
}
