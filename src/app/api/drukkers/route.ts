import { NextResponse } from 'next/server';
import { listRows, insertRow } from '@/lib/server/crud';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';
import { volgendNummer } from '@/lib/server/counters';

export const GET = withMedewerker('GET /api/drukkers', async () => {
  const rows = await listRows<{ id: string; standaard?: boolean }>('drukkers');
  return NextResponse.json(rows.map((row) => ({ ...row, standaard: Boolean(row.standaard) })));
});

export const POST = withMedewerker('POST /api/drukkers', async (request: Request) => {
  // Het nummer is server-eigendom: een drukkernr uit de body wordt weggegooid.
  const { drukkernr: _genegeerd, ...data } = (await request.json()) as Record<string, unknown>;
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    // De standaard-reset zat hiervoor búiten een transactie: een mislukte insert liet
    // dan een leeggemaakte standaardvlag achter. Nu rollen ze samen terug.
    if (data.standaard) {
      await connection.query('UPDATE drukkers SET standaard = FALSE WHERE standaard = TRUE');
    }
    const drukkernr = await volgendNummer(connection, 'drukkernummer', 'DR-');
    const created = await insertRow('drukkers', { ...data, drukkernr }, [], connection);
    await connection.commit();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
