/**
 * Het wachtwoordbeleid, in een module zonder server-afhankelijkheden zodat de
 * formulieren (RegistrationForm, ResetPasswordForm, SettingsSection) dezelfde
 * grens gebruiken als de API-routes -- zonder `crypto` de client-bundle in te
 * trekken. De echte handhaving zit in `valideerWachtwoord` server-side; de
 * client-checks zijn er alleen om de fout meteen bij het veld te tonen.
 */
export const MINIMALE_WACHTWOORDLENGTE = 8;
