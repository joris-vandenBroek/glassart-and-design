import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling('GET /api/prijsmatrix', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(`
    SELECT m.id AS maatId, mat.id AS materiaalId, pm.prijs AS prijs
    FROM maten m
    CROSS JOIN materialen mat
    LEFT JOIN prijsmatrix pm ON pm.maatId = m.id AND pm.materiaalId = mat.id
  `);
  const prijzen = (rows as Array<{ maatId: string; materiaalId: string; prijs: string | null }>).map((row) => ({
    maatId: row.maatId,
    materiaalId: row.materiaalId,
    prijs: row.prijs != null ? Number(row.prijs) : null,
  }));
  return NextResponse.json({ prijzen });
});

export const PUT = withApiErrorHandling('PUT /api/prijsmatrix', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { maatId, materiaalId, prijs } = (await request.json()) as {
    maatId: string;
    materiaalId: string;
    prijs: number | null;
  };
  await getPool().query(
    'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?) ON DUPLICATE KEY UPDATE prijs = VALUES(prijs)',
    [maatId, materiaalId, prijs]
  );
  return NextResponse.json({ ok: true });
});
