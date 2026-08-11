import { describe, expect, it } from 'vitest';
import { getPool } from '@/lib/server/db';
import { parseJsonKolom } from '@/lib/server/crud';

// Tijdelijke verificatietest: bewijst dat de backfill in taak 1 exact overeenkomt met de
// bestaande JSON-kolommen. Wordt in taak 3 verwijderd zodra die kolommen weg zijn -- de
// vergelijkingsbasis bestaat dan niet meer.
const RELATIES = [
  { jsonKolom: 'segmentIds', tabel: 'kunstwerkSegmenten', kolomId: 'segmentId' },
  { jsonKolom: 'materiaalIds', tabel: 'kunstwerkMaterialen', kolomId: 'materiaalId' },
  { jsonKolom: 'maatIds', tabel: 'kunstwerkMaten', kolomId: 'maatId' },
  { jsonKolom: 'stijlIds', tabel: 'kunstwerkStijlen', kolomId: 'stijlId' },
  { jsonKolom: 'onderwerpIds', tabel: 'kunstwerkOnderwerpen', kolomId: 'onderwerpId' },
] as const;

describe('backfill van kunstwerk-relaties naar koppeltabellen', () => {
  it.each(RELATIES)(
    '$tabel bevat exact dezelfde id\'s, in dezelfde volgorde, als kunstwerken.$jsonKolom',
    async ({ jsonKolom, tabel, kolomId }) => {
      const pool = getPool();
      const [kunstwerkRows] = await pool.query(`SELECT id, \`${jsonKolom}\` AS waarde FROM kunstwerken`);
      for (const row of kunstwerkRows as Array<{ id: string; waarde: unknown }>) {
        const verwacht = parseJsonKolom<string[]>(row.waarde, []);
        const [koppelRows] = await pool.query(
          `SELECT \`${kolomId}\` AS relatedId FROM \`${tabel}\` WHERE kunstwerkId = ? ORDER BY volgorde ASC`,
          [row.id]
        );
        const werkelijk = (koppelRows as Array<{ relatedId: string }>).map((r) => r.relatedId);
        expect(werkelijk).toEqual(verwacht);
      }
    }
  );
});
