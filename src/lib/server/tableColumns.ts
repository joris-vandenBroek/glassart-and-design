/**
 * De schrijfbare kolommen per tabel, één op één overgenomen uit `db/schema.sql`.
 *
 * Waarom dit bestaat: `insertRow`/`updateRow` bouwen hun kolomlijst uit de
 * sleutels van een request-body. Die sleutels belanden als identifier in de SQL,
 * en identifiers kunnen niet geparameteriseerd worden -- ze worden tussen
 * backticks gezet. Zonder allowlist bepaalt de aanroeper (en via
 * `POST /api/activiteitenlog` zelfs een niet-ingelogde bezoeker) dus mee wat er
 * letterlijk in de query komt te staan. Deze lijst is de enige plek waar dat
 * wordt afgegrensd.
 *
 * Voeg je een kolom toe in `db/schema.sql` en een migratie, voeg hem hier dan
 * ook toe -- anders wordt een schrijfactie op dat veld geweigerd. Dat is
 * bewust luidruchtig: een onbekende kolom gooit, precies zoals MySQL zelf deed
 * met ER_BAD_FIELD_ERROR, in plaats van stilletjes weg te vallen.
 */
export const TABLE_COLUMNS: Record<string, readonly string[]> = {
  klanten: [
    'id',
    'email',
    'wachtwoordHash',
    'companyName',
    'kvk',
    'btwNummer',
    'contactPerson',
    'phone',
    'contactPreference',
    'address',
    'postcode',
    'city',
    'deliveryAddress',
    'deliveryPostcode',
    'deliveryCity',
    'invoiceAddress',
    'invoicePostcode',
    'invoiceCity',
    'land',
    'invoiceLand',
    'status',
    'prijsgroepId',
    'kunstenaarnr',
    'minimaleAfname',
    'klantnr',
    'createdAt',
    'afwijsreden',
  ],
  medewerkers: ['id', 'email', 'wachtwoordHash', 'naam', 'createdAt'],
  segmenten: ['id', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
  stijlen: ['id', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
  onderwerpen: ['id', 'omschrijvingNl', 'omschrijvingFr', 'omschrijvingDe', 'omschrijvingEn'],
  materiaalsoorten: [
    'id',
    'omschrijvingNl',
    'omschrijvingFr',
    'omschrijvingDe',
    'omschrijvingEn',
    'staatEigenMaatToe',
    'maxBreedte',
    'maxHoogte',
    'levertijdMaandenEigenMaat',
  ],
  materialen: [
    'id',
    'materiaalsoortId',
    'materiaaldikte',
    'prijsPerM2',
    'omschrijvingNl',
    'omschrijvingFr',
    'omschrijvingDe',
    'omschrijvingEn',
  ],
  maten: ['id', 'breedte', 'hoogte'],
  prijsgroepen: ['id', 'naam', 'kortingspercentage', 'opslagpercentage'],
  prijsmatrix: ['id', 'maatId', 'materiaalId', 'prijs'],
  kunstenaars: [
    'id',
    'kunstenaarnr',
    'naam',
    'foto',
    'website',
    'omschrijvingNl',
    'omschrijvingFr',
    'omschrijvingDe',
    'omschrijvingEn',
    'exclusieveKlantIds',
  ],
  kunstenaarAfspraken: ['id', 'prijsafspraken', 'prijsopslag'],
  drukkers: ['id', 'drukkernr', 'naam', 'adres', 'postcode', 'plaats', 'email', 'prijsafspraken', 'standaard'],
  drukkerZendingen: [
    'id',
    'drukkernr',
    'verzondenOp',
    'onderwerp',
    'body',
    'aantalKlanten',
    'aantalRegels',
    'verzondDoor',
    'zendingnummer',
  ],
  drukkerZendingBestellingen: ['zendingnummer', 'bestelnr'],
  kunstwerken: [
    'id',
    'foto',
    'code',
    'kunstenaarnr',
    'formaat',
    'omschrijvingNl',
    'omschrijvingFr',
    'omschrijvingDe',
    'omschrijvingEn',
    'aiGegenereerd',
    'prijsPerM2',
  ],
  instellingen: ['id', 'data'],
  counters: ['id', 'value'],
  bestelheaders: ['id', 'klantnr', 'bestelnr', 'besteldatum', 'status', 'korting', 'zendingnummer', 'afwijsreden'],
  bestellines: [
    'id',
    'bestelnr',
    'code',
    'maatId',
    'materiaalId',
    'prijs',
    'quantity',
    'breedte',
    'hoogte',
  ],
  bestelstatusHistorie: ['id', 'bestelnr', 'status', 'tijdstip'],
  activiteitenlog: ['id', 'type', 'actorId', 'actorEmail', 'actorNaam', 'omschrijving', 'timestamp'],
};

/**
 * Kolommen die nooit teruggegeven mogen worden aan een client, ook niet aan een
 * ingelogde medewerker. `SELECT *` op `klanten` stuurde eerder de scrypt-hash van
 * élke klant mee naar de beheer-UI; dat is precies de dataset die je bij een
 * gestolen sessie of een XSS níet wil weggeven.
 */
export const VERBORGEN_KOLOMMEN: Record<string, readonly string[]> = {
  klanten: ['wachtwoordHash'],
  medewerkers: ['wachtwoordHash'],
};

export function controleerKolommen(table: string, kolommen: string[]): void {
  const toegestaan = TABLE_COLUMNS[table];
  if (!toegestaan) {
    throw new Error(`Onbekende tabel in een schrijfactie: ${table}`);
  }
  const onbekend = kolommen.filter((kolom) => !toegestaan.includes(kolom));
  if (onbekend.length > 0) {
    throw new Error(`Onbekende kolom(men) voor tabel ${table}: ${onbekend.join(', ')}`);
  }
}
