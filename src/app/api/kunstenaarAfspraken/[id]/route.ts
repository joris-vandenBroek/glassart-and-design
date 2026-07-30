import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling(
  'GET /api/kunstenaarAfspraken/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const [rows] = await getPool().query(
      'SELECT prijsafspraken, prijsopslag FROM kunstenaarAfspraken WHERE id = ?',
      [params.id]
    );
    const row = (rows as Array<{ prijsafspraken: string | null; prijsopslag: string | null }>)[0];
    return NextResponse.json({
      prijsafspraken: row?.prijsafspraken ?? null,
      prijsopslag: row?.prijsopslag != null ? Number(row.prijsopslag) : 0,
    });
  }
);

export const PUT = withApiErrorHandling(
  'PUT /api/kunstenaarAfspraken/[id]',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { prijsafspraken, prijsopslag } = (await request.json()) as {
      prijsafspraken: string;
      prijsopslag: number;
    };
    await getPool().query(
      'INSERT INTO kunstenaarAfspraken (id, prijsafspraken, prijsopslag) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE prijsafspraken = VALUES(prijsafspraken), prijsopslag = VALUES(prijsopslag)',
      [params.id, prijsafspraken, prijsopslag]
    );
    return NextResponse.json({ ok: true });
  }
);
