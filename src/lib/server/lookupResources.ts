export interface LookupResourceConfig {
  jsonColumns: string[];
  // Gates GET (list/single) -- only needed for tables the public storefront never reads.
  readAuthRequired?: 'medewerker';
  // Gates POST/PATCH/DELETE -- every one of these tables is only ever written to from
  // the beheer UI, so all of them require a medewerker session to write, even the ones
  // that stay publicly readable for the storefront (kunstwerken, materialen, ...).
  writeAuthRequired?: 'medewerker';
}

export const LOOKUP_RESOURCES: Record<string, LookupResourceConfig> = {
  segmenten: { jsonColumns: [], writeAuthRequired: 'medewerker' },
  materiaalsoorten: { jsonColumns: [], writeAuthRequired: 'medewerker' },
  materialen: { jsonColumns: [], writeAuthRequired: 'medewerker' },
  maten: { jsonColumns: [], writeAuthRequired: 'medewerker' },
  stijlen: { jsonColumns: [], writeAuthRequired: 'medewerker' },
  categorieen: { jsonColumns: [], writeAuthRequired: 'medewerker' },
  // Never fetched by the public storefront (only beheer's KlantModal/PrijsgroepenSection) --
  // gate reads too, same as drukkers.
  prijsgroepen: { jsonColumns: [], readAuthRequired: 'medewerker', writeAuthRequired: 'medewerker' },
};
