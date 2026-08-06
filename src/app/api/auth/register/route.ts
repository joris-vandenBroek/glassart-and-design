import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword } from '@/lib/server/password';
import { SELF_EDITABLE_KLANT_FIELDS } from '@/lib/server/klantFields';
import { isBtwNummerVerplicht, normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';

export async function POST(request: Request) {
  const body = (await request.json()) as { email: string; password: string } & Record<
    string,
    unknown
  >;
  const { email, password } = body;

  const [existing] = await getPool().query('SELECT id FROM klanten WHERE email = ?', [email]);
  if ((existing as unknown[]).length > 0) {
    return NextResponse.json({ error: 'email-in-use' }, { status: 400 });
  }

  // Allowlisted, not spread: the body is untrusted input, and status/prijsgroepId/id/
  // wachtwoordHash/etc. must never be settable by whoever is registering -- otherwise
  // a crafted request could self-approve (status: 'Goedgekeurd') and skip admin review.
  const fields: Record<string, unknown> = {};
  for (const field of SELF_EDITABLE_KLANT_FIELDS) {
    if (field in body) fields[field] = body[field];
  }

  // Registration is the one place where a missing VAT number is fatal: an EU business
  // customer outside NL cannot be invoiced correctly without one. Editing an existing
  // klant deliberately does not enforce this -- see the spec, section D.
  const land = typeof fields.land === 'string' ? fields.land : null;
  const btwNummer = normaliseerBtwNummer(typeof fields.btwNummer === 'string' ? fields.btwNummer : '');
  if (btwNummer === '') {
    if (isBtwNummerVerplicht(land)) {
      return NextResponse.json({ error: 'btwnummer-verplicht' }, { status: 400 });
    }
    fields.btwNummer = null;
  } else {
    if (valideerBtwNummer(btwNummer, land) === 'ongeldig') {
      return NextResponse.json({ error: 'btwnummer-ongeldig' }, { status: 400 });
    }
    fields.btwNummer = btwNummer;
  }

  try {
    const wachtwoordHash = await hashPassword(password);
    await insertRow('klanten', {
      ...fields,
      email,
      wachtwoordHash,
      status: 'Beoordelen',
      prijsgroepId: null,
    } as never);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server-error' }, { status: 500 });
  }
}
