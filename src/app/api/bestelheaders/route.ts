import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { requireKlant, requireMedewerker } from '@/lib/server/requireAuth';
import { berekenBestellijnPrijs } from '@/lib/server/prijsmodule';
import { volgendNummer } from '@/lib/server/counters';
import { parseJsonKolom } from '@/lib/server/crud';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import type { PoolConnection } from 'mysql2/promise';

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
    'SELECT kunstenaarnr FROM kunstwerken WHERE id = ?',
    [kunstwerkId]
  );
  const kunstenaarnr = (kunstwerkRows as Array<{ kunstenaarnr: string | null }>)[0]?.kunstenaarnr;
  if (!kunstenaarnr) return true;

  const [kunstenaarRows] = await connection.query(
    'SELECT exclusieveKlantIds FROM kunstenaars WHERE kunstenaarnr = ?',
    [kunstenaarnr]
  );
  const kunstenaar = (kunstenaarRows as Array<{ exclusieveKlantIds: string | string[] | null }>)[0];
  if (!kunstenaar) return false;

  const exclusieveKlantIds = parseJsonKolom<string[]>(kunstenaar.exclusieveKlantIds, []);
  if (exclusieveKlantIds.length === 0) return true;
  return exclusieveKlantIds.includes(klantId);
}

export const POST = withApiErrorHandling('POST /api/bestelheaders', async (request: Request) => {
  // klantId comes from the session, never from the request body -- otherwise anyone
  // could place an order "as" any customer just by putting a different id in the body.
  const klantId = await requireKlant(request);
  if (!klantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  // Alleen 'Goedgekeurd'-klanten hebben een klantnr. useCustomerAuth's isCustomer-vlag
  // verbergt de bestelknop al voor iedereen daaronder, maar dat is uitsluitend een
  // UI-hint -- zonder deze controle kon een klant die nog in 'Beoordelen' zit via een
  // directe aanroep toch een bestelheaders-rij laten ontstaan, wat de NOT NULL foreign
  // key naar klanten(klantnr) breekt.
  const [klantRows] = await pool.query('SELECT klantnr, status FROM klanten WHERE id = ?', [klantId]);
  const klantRow = (klantRows as Array<{ klantnr: string | null; status: string }>)[0];
  if (!klantRow || klantRow.status !== 'Goedgekeurd' || !klantRow.klantnr) {
    return NextResponse.json({ error: 'klant-niet-goedgekeurd' }, { status: 403 });
  }
  const klantnr = klantRow.klantnr;

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

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const line of lines) {
      if (!(await checkOrderRight(connection, line.kunstwerkId, klantId))) {
        await connection.rollback();
        return NextResponse.json({ error: 'order-not-allowed' }, { status: 403 });
      }
    }

    const resolvedLines: Array<LineInput & { resolvedPrijs: number | null; code: string }> = [];
    for (const line of lines) {
      // De code komt hier uit de database, niet uit de request -- dat is bewust: een
      // client kan zo geen code van een ander werk meesturen.
      const [kunstwerkRows] = await connection.query(
        'SELECT code, kunstenaarnr, maatIds, materiaalIds, prijsPerM2 FROM kunstwerken WHERE id = ?',
        [line.kunstwerkId]
      );
      const kunstwerkRow = (
        kunstwerkRows as Array<{
          code: string;
          kunstenaarnr: string | null;
          maatIds: string | string[] | null;
          materiaalIds: string | string[] | null;
          prijsPerM2: string | null;
        }>
      )[0];
      if (!kunstwerkRow) {
        await connection.rollback();
        return NextResponse.json({ error: 'kunstwerk-not-found' }, { status: 400 });
      }
      const maatIds = parseJsonKolom<string[]>(kunstwerkRow.maatIds, []);
      const materiaalIds = parseJsonKolom<string[]>(kunstwerkRow.materiaalIds, []);

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
          kunstenaarnr: kunstwerkRow.kunstenaarnr,
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
      resolvedLines.push({
        ...line,
        code: kunstwerkRow.code,
        resolvedPrijs: resultaat.status === 'vast' ? resultaat.prijs : null,
      });
    }

    const bestelnr = await volgendNummer(connection, 'bestelnummer', 'BE-');

    const headerId = randomUUID();
    await connection.query(
      'INSERT INTO bestelheaders (id, klantnr, bestelnr, status) VALUES (?, ?, ?, ?)',
      [headerId, klantnr, bestelnr, 'Te beoordelen']
    );
    await connection.query('INSERT INTO bestelstatusHistorie (id, bestelheaderId, status) VALUES (?, ?, ?)', [
      randomUUID(),
      headerId,
      'Te beoordelen',
    ]);

    for (const line of resolvedLines) {
      await connection.query(
        'INSERT INTO bestellines (id, bestelheaderId, code, maatId, materiaalId, prijs, quantity, breedte, hoogte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          headerId,
          line.code,
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
  } catch (error) {
    // Rollbacken en dan doorgooien: de wrapper logt de fout en maakt er een 500
    // van. De oude lege `catch` slikte elke oorzaak stilzwijgend in.
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const GET = withApiErrorHandling('GET /api/bestelheaders', async (request: Request) => {
  const url = new URL(request.url);
  const klantId = url.searchParams.get('klantId');

  // No klantId -- this is the beheer bulk view of every order, staff only.
  // A klantId is present -- allow staff, or the klant themselves viewing their own orders.
  const isMedewerker = await requireMedewerker(request);
  if (!klantId) {
    if (!isMedewerker) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else if (!isMedewerker) {
    const ownKlantId = await requireKlant(request);
    if (ownKlantId !== klantId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const pool = getPool();

  let headerRijen: Array<Record<string, unknown>>;
  if (klantId) {
    // klantId blijft de query-parameter: dat drukt de sessie-identiteit van de klant
    // uit (een UUID), niet de databasekolom. bestelheaders zelf staat nu op klantnr,
    // dus die wordt hier één keer opgezocht in plaats van elke keer te joinen.
    const [klantRows] = await pool.query('SELECT klantnr FROM klanten WHERE id = ?', [klantId]);
    const klantnr = (klantRows as Array<{ klantnr: string | null }>)[0]?.klantnr;
    const [headers] = klantnr
      ? await pool.query('SELECT * FROM bestelheaders WHERE klantnr = ?', [klantnr])
      : [[]];
    headerRijen = headers as Array<Record<string, unknown>>;
  } else {
    const [headers] = await pool.query('SELECT * FROM bestelheaders');
    headerRijen = headers as Array<Record<string, unknown>>;
  }

  if (headerRijen.length === 0) {
    return NextResponse.json([]);
  }

  // Eén query voor alle regels in plaats van één per bestelling: de beheerkant
  // haalt hier élke bestelling op, en dat waren evenveel losse queries als er
  // bestellingen zijn.
  const headerIds = headerRijen.map((header) => header.id);
  const [lines] = await pool.query('SELECT * FROM bestellines WHERE bestelheaderId IN (?)', [
    headerIds,
  ]);
  const regelsPerHeader = new Map<unknown, Array<Record<string, unknown>>>();
  for (const regel of lines as Array<Record<string, unknown>>) {
    const bestaand = regelsPerHeader.get(regel.bestelheaderId);
    if (bestaand) {
      bestaand.push(regel);
    } else {
      regelsPerHeader.set(regel.bestelheaderId, [regel]);
    }
  }

  return NextResponse.json(
    headerRijen.map((header) => {
      const { afwijsreden: _afwijsreden, ...safeHeader } = header;
      return { ...(isMedewerker ? header : safeHeader), lines: regelsPerHeader.get(header.id) ?? [] };
    })
  );
});
