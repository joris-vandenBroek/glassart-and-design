import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { withMedewerker } from '@/lib/server/apiRoute';

type Context = { params: { id: string } };

/**
 * Koppelt dit materiaal aan elk kunstwerk dat al minstens één materiaal heeft.
 *
 * Kunstwerken met nul materialen worden bewust overgeslagen: die zijn materiaalloos
 * (Akoestische stof, zie MATERIAALLOOS_LABEL) en rekenen hun prijs via
 * kunstwerken.prijsPerM2. Een materiaal erbij zou stilzwijgend zowel hun weergave
 * als hun prijspad veranderen.
 */
export const POST = withMedewerker<Context>(
  'POST /api/materialen/[id]/koppel-kunstwerken',
  async (_request: Request, { params }: Context) => {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      // De JOIN filtert materiaalloze kunstwerken er meteen uit; heeftDitMateriaal
      // markeert wat al gekoppeld is, zodat de actie herhaalbaar blijft.
      const [rows] = await connection.query(
        `SELECT km.kunstwerkId AS kunstwerkId,
                MAX(km.volgorde) AS maxVolgorde,
                MAX(km.materiaalId = ?) AS heeftDitMateriaal
         FROM kunstwerkMaterialen km
         GROUP BY km.kunstwerkId`,
        [params.id]
      );
      const teKoppelen = (rows as Array<{ kunstwerkId: string; maxVolgorde: number; heeftDitMateriaal: number }>)
        .filter((row) => !row.heeftDitMateriaal)
        .map((row) => [row.kunstwerkId, params.id, Number(row.maxVolgorde) + 1]);

      if (teKoppelen.length > 0) {
        await connection.query(
          'INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde) VALUES ?',
          [teKoppelen]
        );
      }
      await connection.commit();
      return NextResponse.json({ gekoppeld: teKoppelen.length });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
);
