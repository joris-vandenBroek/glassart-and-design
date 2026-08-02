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
