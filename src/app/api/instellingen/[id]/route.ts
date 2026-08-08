import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { parseJsonKolom } from '@/lib/server/crud';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

/**
 * Welke instellingen-records een bezoeker zonder medewerkersessie mag lezen, en
 * welke velden daarbij worden weggelaten.
 *
 * De GET stond volledig open omdat de publieke contactpagina `bedrijfsgegevens`
 * nodig heeft. Dat record bevat echter ook velden die daar niets te zoeken
 * hebben: `tenaamstelling` en `bic` worden nergens buiten het beheerformulier
 * getoond, maar lagen wel op straat voor iedereen die de URL kende -- gratis
 * materiaal voor factuurfraude.
 *
 * `iban`, `kvkNummer` en `btwNummer` blijven er bewust wél in: die staan met
 * opzet op de contactpagina (zie ContactInfo.tsx).
 */
const PUBLIEKE_INSTELLINGEN: Record<string, { verbergVelden: string[] }> = {
  bedrijfsgegevens: { verbergVelden: ['tenaamstelling', 'bic'] },
  // Btw-tarieven zijn openbare informatie en worden door het klantportaal
  // (account/OrdersSection) gelezen zonder dat daar een medewerker bij zit.
  btwtarieven: { verbergVelden: [] },
};

export const GET = withApiErrorHandling(
  'GET /api/instellingen/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    const isMedewerker = (await requireMedewerker(request)) !== null;
    const publiek = PUBLIEKE_INSTELLINGEN[params.id];
    if (!isMedewerker && !publiek) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const [rows] = await getPool().query('SELECT data FROM instellingen WHERE id = ?', [params.id]);
    const row = (rows as Array<{ data: string | object }>)[0];
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    const data = parseJsonKolom<Record<string, unknown>>(row.data, {});

    if (isMedewerker || publiek.verbergVelden.length === 0) {
      return NextResponse.json(data);
    }
    const zichtbaar = Object.fromEntries(
      Object.entries(data).filter(([veld]) => !publiek.verbergVelden.includes(veld))
    );
    return NextResponse.json(zichtbaar);
  }
);

export const PATCH = withApiErrorHandling(
  'PATCH /api/instellingen/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const data = await request.json();
    await getPool().query(
      'INSERT INTO instellingen (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [params.id, JSON.stringify(data)]
    );
    return NextResponse.json({ ok: true });
  }
);
