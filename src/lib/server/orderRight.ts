import { parseJsonKolom } from '@/lib/server/crud';
import type { Queryable } from '@/lib/server/prijsmodule';

// Mirrors src/lib/resolveOrderRight.ts, which is now a client-side UI hint only —
// this is the real enforcement, since there is no rules-based enforcement layer anymore.
//
// Lives in its own module (not in src/app/api/bestelheaders/route.ts, where it originated)
// because Next.js's App Router validates that a route.ts only exports HTTP method handlers
// (plus a small allowlist like `config`) — a route.ts exporting anything else fails
// `.next/types`'s generated route typecheck. Both POST /api/bestelheaders and PATCH
// /api/bestelheaders/[id]/wijzigen need this same enforcement, so it lives here and both
// route files import it.
export async function checkOrderRight(
  connection: Queryable,
  kunstwerkId: string,
  klantId: string
): Promise<boolean> {
  const [kunstwerkRows] = await connection.query('SELECT kunstenaarnr FROM kunstwerken WHERE id = ?', [kunstwerkId]);
  const kunstenaarnr = (kunstwerkRows as Array<{ kunstenaarnr: string | null }>)[0]?.kunstenaarnr;
  if (!kunstenaarnr) return true;

  const [kunstenaarRows] = await connection.query('SELECT exclusieveKlantIds FROM kunstenaars WHERE kunstenaarnr = ?', [
    kunstenaarnr,
  ]);
  const kunstenaar = (kunstenaarRows as Array<{ exclusieveKlantIds: string | string[] | null }>)[0];
  if (!kunstenaar) return false;

  const exclusieveKlantIds = parseJsonKolom<string[]>(kunstenaar.exclusieveKlantIds, []);
  if (exclusieveKlantIds.length === 0) return true;
  return exclusieveKlantIds.includes(klantId);
}
