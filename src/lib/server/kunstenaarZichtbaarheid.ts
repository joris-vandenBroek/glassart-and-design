/**
 * Een id dat met zekerheid bij geen enkele klant hoort. Houdt "deze kunstenaar
 * is exclusief" zichtbaar zonder te verklappen vóór wie.
 */
const GEHEIME_KLANT = '__exclusief__';

/**
 * Redigeert `exclusieveKlantIds` voor iedereen die geen medewerker is.
 *
 * `GET /api/kunstenaars` staat open voor de publieke collectiepagina, en gaf
 * daarmee de klant-UUID's prijs van wie exclusief bij welke kunstenaar hoort --
 * bedrijfsgevoelige informatie die niets met het tonen van een collectie te
 * maken heeft.
 *
 * De client (`resolveOrderRight`) stelt maar twee vragen aan deze lijst: is hij
 * leeg, en sta ik erin. Beide antwoorden blijven na redactie identiek, dus het
 * gedrag van de winkel verandert niet.
 */
export function redigeerExclusieveKlantIds(ids: unknown, klantId: string | null): string[] {
  const lijst = Array.isArray(ids) ? (ids as string[]) : [];
  if (lijst.length === 0) return [];
  return klantId !== null && lijst.includes(klantId) ? [klantId] : [GEHEIME_KLANT];
}
