import { getRow } from '@/lib/server/crud';
import { normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';

// Shared by both PATCH routes (/api/klanten/me and /api/klanten/[id]). Validates
// btwNummer against the *effective* land: the one in this request if it is being changed,
// otherwise the one already stored. Without that fallback, a request changing only the
// VAT number would have no country to validate against.
//
// Mutates `updates` to store the normalised value, so the database never ends up with
// two spellings of the same number.
//
// An empty value is always allowed here -- the "required for EU klanten" rule applies at
// registration only, because existing EU klanten have no number yet and would otherwise
// become unsaveable. See the spec, section D.
export async function checkBtwNummerUpdate(
  updates: Record<string, unknown>,
  klantId: string
): Promise<'ok' | 'ongeldig'> {
  if (!('btwNummer' in updates)) return 'ok';

  const ruwe = typeof updates.btwNummer === 'string' ? updates.btwNummer : '';
  const genormaliseerd = normaliseerBtwNummer(ruwe);
  if (genormaliseerd === '') {
    updates.btwNummer = null;
    return 'ok';
  }

  let land = typeof updates.land === 'string' ? updates.land : null;
  if (land === null) {
    const klant = await getRow<Record<string, unknown>>('klanten', klantId);
    land = typeof klant?.land === 'string' ? klant.land : null;
  }

  if (valideerBtwNummer(genormaliseerd, land) === 'ongeldig') return 'ongeldig';
  updates.btwNummer = genormaliseerd;
  return 'ok';
}
