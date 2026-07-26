import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ActiviteitType =
  | 'kunstwerk_bekeken'
  | 'mandje_toegevoegd'
  | 'bestelling_geplaatst'
  | 'account_bezocht'
  | 'word_klant_bezocht'
  | 'word_klant_aanvraag'
  | 'klant_goedgekeurd'
  | 'klant_afgewezen'
  | 'klant_gewijzigd'
  | 'klant_prijsgroep_gewijzigd'
  | 'bestelling_goedgekeurd'
  | 'bestelling_afgewezen'
  | 'materiaalsoort_toegevoegd'
  | 'materiaalsoort_gewijzigd'
  | 'materiaalsoort_verwijderd'
  | 'materiaal_toegevoegd'
  | 'materiaal_gewijzigd'
  | 'materiaal_verwijderd'
  | 'maat_toegevoegd'
  | 'maat_gewijzigd'
  | 'maat_verwijderd'
  | 'segment_toegevoegd'
  | 'segment_gewijzigd'
  | 'segment_verwijderd'
  | 'kunstwerk_toegevoegd'
  | 'kunstwerk_gewijzigd'
  | 'kunstwerk_verwijderd'
  | 'prijsgroep_toegevoegd'
  | 'prijsgroep_gewijzigd'
  | 'prijsgroep_verwijderd'
  | 'bedrijfsgegevens_gewijzigd'
  | 'mandje_eigen_maat_toegevoegd'
  | 'bestelling_prijs_vastgesteld'
  | 'bestelling_regel_gewijzigd'
  | 'kunstenaar_toegevoegd'
  | 'kunstenaar_gewijzigd'
  | 'kunstenaar_verwijderd'
  | 'klant_exclusiviteit_gewijzigd'
  | 'drukker_toegevoegd'
  | 'drukker_gewijzigd'
  | 'drukker_verwijderd'
  | 'bestelling_verstuurd_naar_drukker'
  | 'bestelinstellingen_gewijzigd'
  | 'klant_minimale_afname_gewijzigd'
  | 'stijl_toegevoegd'
  | 'stijl_gewijzigd'
  | 'stijl_verwijderd'
  | 'onderwerp_toegevoegd'
  | 'onderwerp_gewijzigd'
  | 'onderwerp_verwijderd';

export interface ActiviteitActor {
  id: string | null;
  email: string;
  naam: string;
}

export const ONBEKENDE_ACTOR: ActiviteitActor = { id: null, email: 'Onbekend', naam: 'Onbekend' };

export async function logActiviteit(type: ActiviteitType, actor: ActiviteitActor): Promise<void> {
  try {
    await addDoc(collection(db, 'activiteitenlog'), {
      type,
      actorId: actor.id,
      actorEmail: actor.email,
      actorNaam: actor.naam,
      timestamp: serverTimestamp(),
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
