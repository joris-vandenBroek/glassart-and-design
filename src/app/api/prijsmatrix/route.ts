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
  const { regels } = (await request.json()) as {
    regels: Array<{ maatId: string; materiaalId: string; prijs: number | null }>;
  };

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const regel of regels) {
      await connection.query(
        'INSERT INTO prijsmatrix (id, maatId, materiaalId, prijs) VALUES (UUID(), ?, ?, ?) ON DUPLICATE KEY UPDATE prijs = VALUES(prijs)',
        [regel.maatId, regel.materiaalId, regel.prijs]
      );
    }
    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch {
    await connection.rollback();
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  } finally {
    connection.release();
  }
});
