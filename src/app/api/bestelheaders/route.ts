import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { berekenBestellijnPrijs } from '@/lib/server/prijsmodule';
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
  for (const dim of [line.breedte, line.hoogte]) {
    if (dim !== undefined && (!Number.isInteger(dim) || dim <= 0)) {
      return 'invalid-afmeting';
    }
  }
  return null;
}

// Mirrors src/lib/resolveOrderRight.ts, which is now a client-side UI hint only —
// this is the real enforcement, since there is no rules-based enforcement layer anymore.
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
    'SELECT exclusieveKlantIds FROM kunstenaars WHERE id = ?',
    [kunstenaarId]
  );
  const kunstenaar = (kunstenaarRows as Array<{ exclusieveKlantIds: string | string[] | null }>)[0];
  if (!kunstenaar) return false;

  const exclusieveKlantIds: string[] =
    typeof kunstenaar.exclusieveKlantIds === 'string'
      ? JSON.parse(kunstenaar.exclusieveKlantIds)
      : kunstenaar.exclusieveKlantIds ?? [];
  if (exclusieveKlantIds.length === 0) return true;
  return exclusieveKlantIds.includes(klantId);
}

export async function POST(request: Request) {
  // klantId comes from the session, never from the request body -- otherwise anyone
  // could place an order "as" any customer just by putting a different id in the body.
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { lines } = (await request.json()) as { lines?: LineInput[] };

  // Zonder deze controle liep een body zonder (of met een niet-array) `lines`
  // stuk op de for-of eronder, en kwam er een 500 terug op wat gewoon een
  // ongeldige request is. Een lége lijst blijft bewust toegestaan: dat is geen
  // ongeldige request, en de beheerkant maakt er gebruik van.
  if (!Array.isArray(lines)) {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
  }

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

    const resolvedLines: Array<LineInput & { resolvedPrijs: number | null }> = [];
    for (const line of lines) {
      const [kunstwerkRows] = await connection.query(
        'SELECT kunstenaarId, maatIds, materiaalIds, prijsPerM2 FROM kunstwerken WHERE id = ?',
        [line.kunstwerkId]
      );
      const kunstwerkRow = (
        kunstwerkRows as Array<{
          kunstenaarId: string | null;
          maatIds: string | string[] | null;
          materiaalIds: string | string[] | null;
          prijsPerM2: string | null;
        }>
      )[0];
      if (!kunstwerkRow) {
        await connection.rollback();
        return NextResponse.json({ error: 'kunstwerk-not-found' }, { status: 400 });
      }
      // mysql2 auto-parses a native JSON column to an array/object on a plain
      // pool/connection.query() (confirmed during Task 3's review) -- only JSON.parse
      // it when it actually comes back as a string, same guard as prijsmodule.ts's
      // berekenPrijzenVoorAlleKunstwerken and crud.ts's deserializeRow.
      const maatIds: string[] =
        typeof kunstwerkRow.maatIds === 'string' ? JSON.parse(kunstwerkRow.maatIds) : kunstwerkRow.maatIds ?? [];
      const materiaalIds: string[] =
        typeof kunstwerkRow.materiaalIds === 'string'
          ? JSON.parse(kunstwerkRow.materiaalIds)
          : kunstwerkRow.materiaalIds ?? [];

      if (materiaalIds.length > 0 && !materiaalIds.includes(line.materiaalId)) {
        await connection.rollback();
        return NextResponse.json({ error: 'materiaal-niet-beschikbaar' }, { status: 400 });
      }

      // An empty maatId is the genuine custom-size ("eigen maat") path -- it always requires
      // real afmetingen, since prijsmodule.ts's berekenBestellijnPrijs uses breedte/hoogte
      // (via prijsPerM2) to price it, or leaves it null for staff to price later. Any other
      // maatId must be a real member of this kunstwerk's own maatIds -- otherwise
      // berekenBestellijnPrijs would treat an unrelated-but-real maatId as "op-aanvraag"
      // (meant only for the legitimate custom-size case), silently letting the order through.
      if (line.maatId === '') {
        if (
          !Number.isInteger(line.breedte) ||
          (line.breedte as number) <= 0 ||
          !Number.isInteger(line.hoogte) ||
          (line.hoogte as number) <= 0
        ) {
          await connection.rollback();
          return NextResponse.json({ error: 'afmeting-vereist' }, { status: 400 });
        }
      } else if (maatIds.length > 0 && !maatIds.includes(line.maatId)) {
        await connection.rollback();
        return NextResponse.json({ error: 'maat-niet-beschikbaar' }, { status: 400 });
      }

      const resultaat = await berekenBestellijnPrijs(
        connection,
        {
          kunstenaarId: kunstwerkRow.kunstenaarId,
          maatIds,
          prijsPerM2: kunstwerkRow.prijsPerM2 != null ? Number(kunstwerkRow.prijsPerM2) : null,
        },
        line,
        klantId
      );
      if (resultaat.status === 'onbekend') {
        await connection.rollback();
        return NextResponse.json({ error: 'prijs-onbekend' }, { status: 400 });
      }
      if (resultaat.status === 'vast' && resultaat.prijs <= 0) {
        await connection.rollback();
        return NextResponse.json({ error: 'prijs-onbekend' }, { status: 400 });
      }
      resolvedLines.push({ ...line, resolvedPrijs: resultaat.status === 'vast' ? resultaat.prijs : null });
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
    const bestelnr = `BE-${String(nextValue).padStart(BESTELNR_PADDING, '0')}`;

    const headerId = randomUUID();
    await connection.query(
      'INSERT INTO bestelheaders (id, klantId, bestelnr, status) VALUES (?, ?, ?, ?)',
      [headerId, klantId, bestelnr, 'Te beoordelen']
    );
    await connection.query('INSERT INTO bestelstatusHistorie (id, bestelheaderId, status) VALUES (?, ?, ?)', [
      randomUUID(),
      headerId,
      'Te beoordelen',
    ]);

    for (const line of resolvedLines) {
      await connection.query(
        'INSERT INTO bestellines (id, bestelheaderId, kunstwerkId, maatId, materiaalId, prijs, quantity, breedte, hoogte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          headerId,
          line.kunstwerkId,
          line.maatId,
          line.materiaalId,
          line.resolvedPrijs,
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

  // No klantId -- this is the beheer bulk view of every order, staff only.
  // A klantId is present -- allow staff, or the klant themselves viewing their own orders.
  if (!klantId) {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    const isMedewerker = await requireMedewerker(request);
    if (!isMedewerker) {
      const ownKlantId = await requireKlant(request);
      if (ownKlantId !== klantId) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }
  }

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
