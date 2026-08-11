import type { Kunstwerk, Materiaal, Materiaalsoort } from '@/components/beheer/materiaalTypes';

const VEILIGHEIDSGLAS_SOORT_NAAM = 'Veiligheidsglas';
const VEILIGHEIDSGLAS_DIKTE = 4;

export const MATERIAALLOOS_LABEL = 'Akoestische stof';

export function findVeiligheidsglasMateriaalId(
  materialen: Materiaal[],
  materiaalsoorten: Materiaalsoort[]
): string | undefined {
  const veiligheidsglasSoortIds = new Set(
    materiaalsoorten
      .filter((soort) => soort.omschrijvingNl === VEILIGHEIDSGLAS_SOORT_NAAM)
      .map((soort) => soort.id)
  );
  return materialen.find(
    (materiaal) =>
      veiligheidsglasSoortIds.has(materiaal.materiaalsoortId) && materiaal.materiaaldikte === VEILIGHEIDSGLAS_DIKTE
  )?.id;
}

export function resolveKunstwerkMateriaalLabel(
  kunstwerk: Pick<Kunstwerk, 'materiaalIds'>,
  materialen: Materiaal[],
  materiaalsoorten: Materiaalsoort[]
): string {
  if (kunstwerk.materiaalIds.length === 0) {
    return MATERIAALLOOS_LABEL;
  }

  const veiligheidsglasId = findVeiligheidsglasMateriaalId(materialen, materiaalsoorten);
  if (veiligheidsglasId && kunstwerk.materiaalIds.includes(veiligheidsglasId)) {
    return `${VEILIGHEIDSGLAS_DIKTE}mm ${VEILIGHEIDSGLAS_SOORT_NAAM}`;
  }

  const beschikbareMaterialen = materialen.filter((materiaal) => kunstwerk.materiaalIds.includes(materiaal.id));
  if (beschikbareMaterialen.length > 0) {
    const materiaalsoortNaamById = new Map(materiaalsoorten.map((soort) => [soort.id, soort.omschrijvingNl]));
    return beschikbareMaterialen
      .map(
        (materiaal) =>
          `${materiaal.materiaaldikte}mm ${materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId}`
      )
      .join(' | ');
  }

  return MATERIAALLOOS_LABEL;
}
