import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

export const GET = withApiErrorHandling(
  'GET /api/instellingen/[id]',
  async (_request: Request, { params }: { params: { id: string } }) => {
    const [rows] = await getPool().query('SELECT data FROM instellingen WHERE id = ?', [params.id]);
    const row = (rows as Array<{ data: string | object }>)[0];
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    // mysql2 auto-parses JSON columns into objects, so `data` may already be an
    // object rather than a string — only parse when it genuinely came back as text.
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return NextResponse.json(data);
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
