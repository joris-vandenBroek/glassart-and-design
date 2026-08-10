import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';

export function resolveKunstenaarOmschrijving(kunstenaar: Kunstenaar, locale: string): string {
  const byLocale: Record<string, string> = {
    fr: kunstenaar.omschrijvingFr,
    de: kunstenaar.omschrijvingDe,
    en: kunstenaar.omschrijvingEn,
  };
  return byLocale[locale] || kunstenaar.omschrijvingNl;
}

export function appendKunstenaarWebsiteZin(omschrijving: string, zin: string | null): string {
  return zin ? `${omschrijving}\n\n${zin}` : omschrijving;
}
