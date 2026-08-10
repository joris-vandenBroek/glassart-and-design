export interface MeertaligeOmschrijving {
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export function resolveOmschrijving(item: MeertaligeOmschrijving, locale: string): string {
  const byLocale: Record<string, string> = {
    fr: item.omschrijvingFr,
    de: item.omschrijvingDe,
    en: item.omschrijvingEn,
  };
  return byLocale[locale] || item.omschrijvingNl;
}
