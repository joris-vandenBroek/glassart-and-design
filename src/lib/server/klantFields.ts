// Fields a klant may set about themselves -- at registration (POST /api/auth/register)
// and when editing their own profile (PATCH /api/klanten/me). Deliberately excludes
// status/prijsgroepId/kunstenaarId/minimaleAfname/wachtwoordHash/id -- those
// are staff-only decisions (set via /api/klanten/[id], gated on requireMedewerker) or
// handled separately, and must never be settable directly from a klant-facing request body.
/**
 * Normaliseert een e-mailadres uit een request-body: trim + kleine letters.
 *
 * Zonder dit gedroegen `Foo@x.nl` en `foo@x.nl` zich verschillend, afhankelijk
 * van de collation van de kolom -- wat betekende dat de uniciteitscontrole bij
 * registratie iets anders vergeleek dan de UNIQUE-index in de database.
 * Geeft `null` terug wanneer er niets bruikbaars in stond.
 */
export function normaliseerEmail(waarde: unknown): string | null {
  if (typeof waarde !== 'string') return null;
  const genormaliseerd = waarde.trim().toLowerCase();
  // Bewust minimaal: de echte controle is de UNIQUE-index plus de bevestigingsmail.
  if (genormaliseerd === '' || !genormaliseerd.includes('@')) return null;
  return genormaliseerd;
}

export const SELF_EDITABLE_KLANT_FIELDS = [
  'companyName',
  'kvk',
  'btwNummer',
  'contactPerson',
  'contactPreference',
  'phone',
  'address',
  'postcode',
  'city',
  'deliveryAddress',
  'deliveryPostcode',
  'deliveryCity',
  'invoiceAddress',
  'invoicePostcode',
  'invoiceCity',
  'land',
  'invoiceLand',
] as const;
