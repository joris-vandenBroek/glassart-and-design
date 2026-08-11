import type { Pool } from 'mysql2/promise';
import { getPool } from './db';

/**
 * Vergelijkt hoofdletterongevoelig, want dat is precies wat de UNIQUE-index op
 * `kunstwerken.code` doet -- de tabel staat op utf8mb4_general_ci. Zou dit binair
 * vergelijken, dan meldde het scherm "code is vrij" en gooide MySQL er alsnog een
 * duplicate-key overheen.
 */
export async function codeIsInGebruik(
  code: string,
  behalveKunstwerkId: string | null
): Promise<boolean> {
  const [rows] = behalveKunstwerkId
    ? await getPool().query('SELECT 1 FROM kunstwerken WHERE code = ? AND id <> ? LIMIT 1', [
        code,
        behalveKunstwerkId,
      ])
    : await getPool().query('SELECT 1 FROM kunstwerken WHERE code = ? LIMIT 1', [code]);
  return (rows as unknown[]).length > 0;
}

/**
 * Ongeacht de status van de bestelling: ook een geannuleerde of afgeronde bestelling
 * is mogelijk al bij de drukker geweest.
 */
export async function codeKomtVoorInBestelling(code: string): Promise<boolean> {
  const [rows] = await getPool().query('SELECT 1 FROM bestellines WHERE code = ? LIMIT 1', [code]);
  return (rows as unknown[]).length > 0;
}

/**
 * Zelfde controle als `codeKomtVoorInBestelling`, maar met `FOR UPDATE` op een
 * meegegeven transactie-connection, voor DELETE /api/kunstwerken/[id]. Een gewone
 * SELECT neemt geen slot op een bestellines-rij die nog niet bestaat, dus twee
 * gelijktijdige acties -- een bestelling die met deze code committeert en een
 * verwijdering van het kunstwerk met die code -- komen er dan allebei ongehinderd
 * langs. `FOR UPDATE` neemt InnoDB's gap lock op de buurt van deze code (mogelijk
 * gemaakt door de index op bestellines.code, zie
 * db/migrations/2026-08-10-bestelline-code-index.sql) en blokkeert daarmee een
 * gelijktijdige INSERT met dezelfde code totdat deze transactie commit of rollbackt.
 *
 * Dat sluit precies één interleaving: heeft een bestelling haar bestellines-INSERT
 * al onderweg (nog niet gecommit) wanneer deze check draait, dan houdt die INSERT
 * het rijslot vast en is het déze SELECT ... FOR UPDATE die daarop wacht -- niet
 * andersom. De bestelling zelf loopt ongehinderd door en committeert gewoon,
 * volledig onaangetast door deze verwijderpoging; pas ná die commit komt deze
 * check los, ziet ze de bestellines-rij alsnog en levert de medewerker een 409 op.
 * Het sluit niét de omgekeerde volgorde: draait deze
 * transactie eerst, dan vindt ze niets, deelt ze een gap lock uit, verwijdert en
 * committeert -- en de bestelling die vlak daarna zijn INSERT doet, gaat gewoon
 * door. `POST /api/bestelheaders` leest het kunstwerk namelijk met een gewone,
 * niet-blokkerende SELECT, ruim vóór deze transactie, en valideert niet opnieuw
 * vlak voor het schrijven. Resultaat: een bestellines-rij met deze code, zonder dat
 * er nog een kunstwerk met die code bestaat.
 *
 * Dat is volgens het ontwerp (`docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md`,
 * beslissing 3) geen probleem op zich: een bestelregel legt de code vast als
 * historische waarde, niet als verwijzing, en er is bewust geen foreign key. Het
 * enige dat wél moet blijven gelden, is dat zo'n vrijgekomen code nooit aan een
 * ánder kunstwerk gegeven wordt -- anders wijst de historische bestelregel straks
 * stil naar het verkeerde werk. Dát wordt niet hier voorkomen, maar bij het
 * uitgeven van een code: `POST /api/kunstwerken` en `PATCH /api/kunstwerken/[id]`
 * controleren met `codeKomtVoorInBestelling` of een code al in bestellines
 * voorkomt, ook als geen enkel kunstwerk hem op dit moment nog draagt, en weigeren
 * hem dan met dezelfde `code-bestaat-al` als een code die een ander kunstwerk al
 * heeft.
 *
 * Die controle sluit definitief af wat al zíchtbaar -- gecommit -- in bestellines
 * staat: zo'n code komt nooit opnieuw uit. Ze sluit niet de driewegs-race
 * hierboven, want `codeKomtVoorInBestelling` is zelf ook maar een gewone,
 * niet-blokkerende SELECT: staat de bestellines-INSERT van een bestelling nog
 * open op het moment dat die controle draait, dan is die rij voor haar
 * onzichtbaar -- precies hetzelfde tijdgat als bij deze DELETE. Loopt dan eerst
 * deze DELETE (ná de leesactie van de bestelling, maar vóór haar INSERT), gevolgd
 * door een POST /api/kunstwerken met dezelfde code, en pas dáárna de INSERT van
 * die bestelling, dan krijgt een ánder kunstwerk alsnog de code van een bestaande
 * historische bestelregel. Dat zou pas dichtgaan met een lockende lezing bij het
 * uitgeven zelf, of doordat `POST /api/bestelheaders` het kunstwerk vlak vóór zijn
 * eigen INSERT nog eens met een lockende lezing herbevestigt -- een gewone
 * herhaalde SELECT volstaat daar niet voor, want onder REPEATABLE READ levert die
 * dezelfde snapshot als de eerste keer.
 */
export async function codeKomtVoorInBestellingForUpdate(
  code: string,
  connection: Pick<Pool, 'query'>
): Promise<boolean> {
  const [rows] = await connection.query('SELECT 1 FROM bestellines WHERE code = ? LIMIT 1 FOR UPDATE', [code]);
  return (rows as unknown[]).length > 0;
}

/**
 * De `codeIsInGebruik`-SELECT levert de nette foutmelding, maar is niet de garantie: een
 * gewone SELECT op een rij die nog niet bestaat neemt geen slot, dus twee medewerkers
 * die tegelijk dezelfde code opslaan komen er beide langs. De UNIQUE-index vangt dat,
 * en zonder deze vertaling maakt withApiErrorHandling van die botsing een 500 in plaats
 * van dezelfde 409 als de voorcontrole.
 */
export function isDuplicateCodeError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY';
}
