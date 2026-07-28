export interface LookupResourceConfig {
  jsonColumns: string[];
  authRequired?: 'medewerker';
}

export const LOOKUP_RESOURCES: Record<string, LookupResourceConfig> = {
  segmenten: { jsonColumns: [] },
  materiaalsoorten: { jsonColumns: [] },
  materialen: { jsonColumns: [] },
  maten: { jsonColumns: [] },
  stijlen: { jsonColumns: [] },
  onderwerpen: { jsonColumns: [] },
  prijsgroepen: { jsonColumns: [] },
  kunstwerken: {
    jsonColumns: ['segmentIds', 'materiaalIds', 'maatIds', 'stijlIds', 'onderwerpIds', 'prijzen'],
  },
  drukkers: { jsonColumns: [], authRequired: 'medewerker' },
};
