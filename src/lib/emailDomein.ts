export const BEDRIJFS_EMAIL_DOMEIN = '@glassartanddesign.com';

/**
 * Vult een korte gebruikersnaam ("hem", "paul", "julie") aan tot een volledig
 * bedrijfs-e-mailadres. Bevat de invoer al een "@", dan blijft die ongemoeid --
 * er zijn medewerkers met een adres buiten het bedrijfsdomein.
 */
export function completeerBedrijfsEmail(waarde: string): string {
  const getrimd = waarde.trim();
  if (!getrimd || getrimd.includes('@')) {
    return getrimd;
  }
  return `${getrimd}${BEDRIJFS_EMAIL_DOMEIN}`;
}

/** Lokale dev of staging -- alleen daar worden testaccounts automatisch aangevuld. */
export function isTestOmgeving(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL === 'staging'
  );
}

const TEST_KLANT_PATROON = /^test\d+$/i;

/**
 * Vult "test1" t/m "test5" (en verdere testaccounts) aan tot het volledige
 * e-mailadres, maar alleen lokaal en op staging. Elke andere invoer blijft
 * ongewijzigd, zodat echte klanten hier niets van merken.
 */
export function completeerTestKlantEmail(waarde: string): string {
  const getrimd = waarde.trim();
  if (!isTestOmgeving() || !TEST_KLANT_PATROON.test(getrimd)) {
    return getrimd;
  }
  return `${getrimd.toLowerCase()}${BEDRIJFS_EMAIL_DOMEIN}`;
}
