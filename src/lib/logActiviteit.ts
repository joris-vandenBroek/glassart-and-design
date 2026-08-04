export const ACTIVITEIT_TYPES = [
  'kunstwerk_bekeken',
  'mandje_toegevoegd',
  'bestelling_geplaatst',
  'account_bezocht',
  'word_klant_bezocht',
  'word_klant_aanvraag',
  'klant_goedgekeurd',
  'klant_afgewezen',
  'klant_gewijzigd',
  'klant_prijsgroep_gewijzigd',
  'bestelling_goedgekeurd',
  'bestelling_afgewezen',
  'materiaalsoort_toegevoegd',
  'materiaalsoort_gewijzigd',
  'materiaalsoort_verwijderd',
  'materiaal_toegevoegd',
  'materiaal_gewijzigd',
  'materiaal_verwijderd',
  'maat_toegevoegd',
  'maat_gewijzigd',
  'maat_verwijderd',
  'segment_toegevoegd',
  'segment_gewijzigd',
  'segment_verwijderd',
  'kunstwerk_toegevoegd',
  'kunstwerk_gewijzigd',
  'kunstwerk_verwijderd',
  'prijsgroep_toegevoegd',
  'prijsgroep_gewijzigd',
  'prijsgroep_verwijderd',
  'prijsmatrix_gewijzigd',
  'bedrijfsgegevens_gewijzigd',
  'mandje_eigen_maat_toegevoegd',
  'bestelling_prijs_vastgesteld',
  'bestelling_regel_gewijzigd',
  'kunstenaar_toegevoegd',
  'kunstenaar_gewijzigd',
  'kunstenaar_verwijderd',
  'klant_kunstenaarkoppeling_gewijzigd',
  'drukker_toegevoegd',
  'drukker_gewijzigd',
  'drukker_verwijderd',
  'bestelling_verstuurd_naar_drukker',
  'bestelinstellingen_gewijzigd',
  'btwtarieven_gewijzigd',
  'klant_minimale_afname_gewijzigd',
  'stijl_toegevoegd',
  'stijl_gewijzigd',
  'stijl_verwijderd',
  'onderwerp_toegevoegd',
  'onderwerp_gewijzigd',
  'onderwerp_verwijderd',
] as const;

export type ActiviteitType = (typeof ACTIVITEIT_TYPES)[number];

export interface ActiviteitActor {
  id: string | null;
  email: string;
  naam: string;
}

export const ONBEKENDE_ACTOR: ActiviteitActor = { id: null, email: 'Onbekend', naam: 'Onbekend' };

export async function logActiviteit(
  type: ActiviteitType,
  actor: ActiviteitActor,
  omschrijving?: string
): Promise<void> {
  try {
    await fetch('/api/activiteitenlog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type,
        actorId: actor.id,
        actorEmail: actor.email,
        actorNaam: actor.naam,
        ...(omschrijving ? { omschrijving } : {}),
      }),
    });
  } catch {
    // Fire-and-forget: a failed log write must never block or surface an
    // error for the underlying user action (page visit, cart add, etc.).
  }
}

export function actorFromCustomer(
  user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
): ActiviteitActor {
  if (!user) {
    return ONBEKENDE_ACTOR;
  }
  return {
    id: user.uid,
    email: user.email ?? 'Onbekend',
    naam: user.companyName ?? user.contactPerson ?? 'Onbekend',
  };
}

export function actorFromMedewerker(
  user: { uid: string; email: string | null } | null
): ActiviteitActor {
  if (!user) {
    return ONBEKENDE_ACTOR;
  }
  const email = user.email ?? 'Onbekend';
  return { id: user.uid, email, naam: email };
}
