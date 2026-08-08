import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { volgendNummer } from '@/lib/server/counters';
import { withMedewerker } from '@/lib/server/apiRoute';

export const POST = withMedewerker<{ params: { id: string } }>(
  'POST /api/drukkers/[id]/zendingen/nummer',
  async () => {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const zendingnummer = await volgendNummer(connection, 'zendingnummer', 'ZD-');
      await connection.commit();
      return NextResponse.json({ zendingnummer });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
