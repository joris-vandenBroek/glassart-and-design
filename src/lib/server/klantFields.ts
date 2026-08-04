// Fields a klant may set about themselves -- at registration (POST /api/auth/register)
// and when editing their own profile (PATCH /api/klanten/me). Deliberately excludes
// status/prijsgroepId/kunstenaarId/minimaleAfname/wachtwoordHash/id -- those
// are staff-only decisions (set via /api/klanten/[id], gated on requireMedewerker) or
// handled separately, and must never be settable directly from a klant-facing request body.
export const SELF_EDITABLE_KLANT_FIELDS = [
  'companyName',
  'kvk',
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
