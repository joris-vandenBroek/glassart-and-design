import type { Bestelling } from '@/components/beheer/BestellingenSection';

export type KlantBestellingStatus = 'inBehandeling' | 'afgewezen';

const KLANT_STATUS_MAP: Record<Bestelling['status'], KlantBestellingStatus> = {
  'Te beoordelen': 'inBehandeling',
  'Te versturen naar drukker': 'inBehandeling',
  'Verstuurd naar drukker': 'inBehandeling',
  Afgewezen: 'afgewezen',
};

export function toKlantBestellingStatus(status: Bestelling['status']): KlantBestellingStatus {
  return KLANT_STATUS_MAP[status];
}

export const KLANT_STATUS_BADGE_CLASS: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'bg-sky-400/10 text-sky-300',
  afgewezen: 'bg-red-400/10 text-red-400',
};

// Key into the `accountPage.orders` i18n namespace — keeping this a Record (not an
// if/else in each consumer) means a future third KlantBestellingStatus fails to compile
// here until someone picks its label, instead of silently falling through to a wrong one.
export const KLANT_STATUS_TRANSLATION_KEY: Record<KlantBestellingStatus, string> = {
  inBehandeling: 'statusInBehandeling',
  afgewezen: 'statusAfgewezen',
};
