import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';
import { resolveerBestellijnPrijs, statusVoorFout } from '@/lib/server/bestellijnPrijsResolver';

// Puur lezend: berekent wat een nieuwe bestellijn zou kosten zonder hem op te slaan, zodat
// de medewerker een prijs ziet vóórdat "Regel toevoegen" via PATCH .../wijzigen echt
// opslaat. Gebruikt dezelfde resolveerBestellijnPrijs als die PATCH, dus dit voorbeeld kan
// nooit afwijken van de prijs die de echte toevoeging straks berekent.
export const GET = withMedewerker<{ params: { id: string } }>(
  'GET /api/bestelheaders/[id]/prijsvoorbeeld',
  async (request, { params }) => {
    const url = new URL(request.url);
    const kunstwerkId = url.searchParams.get('kunstwerkId');
    const materiaalId = url.searchParams.get('materiaalId');
    const maatId = url.searchParams.get('maatId');
    const breedteParam = url.searchParams.get('breedte');
    const hoogteParam = url.searchParams.get('hoogte');

    if (!kunstwerkId || !materiaalId || maatId === null) {
      return NextResponse.json({ error: 'invalid-body' }, { status: 400 });
    }

    const pool = getPool();
    const [headerRows] = await pool.query('SELECT klantnr FROM bestelheaders WHERE id = ?', [params.id]);
    const header = (headerRows as Array<{ klantnr: string }>)[0];
    if (!header) {
      return NextResponse.json({ error: 'niet-gevonden' }, { status: 404 });
    }
    const [klantRows] = await pool.query('SELECT id FROM klanten WHERE klantnr = ?', [header.klantnr]);
    const klantId = (klantRows as Array<{ id: string }>)[0]?.id ?? null;

    const resultaat = await resolveerBestellijnPrijs(
      pool,
      {
        kunstwerkId,
        materiaalId,
        maatId,
        breedte: breedteParam ? Number(breedteParam) : undefined,
        hoogte: hoogteParam ? Number(hoogteParam) : undefined,
      },
      klantId
    );

    if (resultaat.status === 'fout') {
      return NextResponse.json({ error: resultaat.error }, { status: statusVoorFout(resultaat.error) });
    }
    return NextResponse.json(resultaat);
  }
);
