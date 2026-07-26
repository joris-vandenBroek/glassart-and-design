'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import type { ActiviteitType } from '@/lib/logActiviteit';

export interface Activiteit {
  id: string;
  type: ActiviteitType;
  actorEmail: string;
  actorNaam: string;
  timestamp: Date | null;
}

interface ActiviteitRow {
  id: string;
  tijdstip: string;
  typeLabel: string;
  actorNaam: string;
  actorEmail: string;
}

interface ActiviteitSectionProps {
  activiteiten: Activiteit[] | null;
  loadError: string | null;
}

const TYPE_LABEL_KEYS: Record<ActiviteitType, string> = {
  kunstwerk_bekeken: 'activiteitTypeKunstwerkBekeken',
  mandje_toegevoegd: 'activiteitTypeMandjeToegevoegd',
  mandje_eigen_maat_toegevoegd: 'activiteitTypeMandjeEigenMaatToegevoegd',
  bestelling_geplaatst: 'activiteitTypeBestellingGeplaatst',
  account_bezocht: 'activiteitTypeAccountBezocht',
  word_klant_bezocht: 'activiteitTypeWordKlantBezocht',
  word_klant_aanvraag: 'activiteitTypeWordKlantAanvraag',
  klant_goedgekeurd: 'activiteitTypeKlantGoedgekeurd',
  klant_afgewezen: 'activiteitTypeKlantAfgewezen',
  klant_gewijzigd: 'activiteitTypeKlantGewijzigd',
  klant_prijsgroep_gewijzigd: 'activiteitTypeKlantPrijsgroepGewijzigd',
  bestelling_goedgekeurd: 'activiteitTypeBestellingGoedgekeurd',
  bestelling_afgewezen: 'activiteitTypeBestellingAfgewezen',
  bestelling_prijs_vastgesteld: 'activiteitTypeBestellingPrijsVastgesteld',
  bestelling_regel_gewijzigd: 'activiteitTypeBestellingRegelGewijzigd',
  materiaalsoort_toegevoegd: 'activiteitTypeMateriaalsoortToegevoegd',
  materiaalsoort_gewijzigd: 'activiteitTypeMateriaalsoortGewijzigd',
  materiaalsoort_verwijderd: 'activiteitTypeMateriaalsoortVerwijderd',
  materiaal_toegevoegd: 'activiteitTypeMateriaalToegevoegd',
  materiaal_gewijzigd: 'activiteitTypeMateriaalGewijzigd',
  materiaal_verwijderd: 'activiteitTypeMateriaalVerwijderd',
  maat_toegevoegd: 'activiteitTypeMaatToegevoegd',
  maat_gewijzigd: 'activiteitTypeMaatGewijzigd',
  maat_verwijderd: 'activiteitTypeMaatVerwijderd',
  segment_toegevoegd: 'activiteitTypeSegmentToegevoegd',
  segment_gewijzigd: 'activiteitTypeSegmentGewijzigd',
  segment_verwijderd: 'activiteitTypeSegmentVerwijderd',
  kunstwerk_toegevoegd: 'activiteitTypeKunstwerkToegevoegd',
  kunstwerk_gewijzigd: 'activiteitTypeKunstwerkGewijzigd',
  kunstwerk_verwijderd: 'activiteitTypeKunstwerkVerwijderd',
  prijsgroep_toegevoegd: 'activiteitTypePrijsgroepToegevoegd',
  prijsgroep_gewijzigd: 'activiteitTypePrijsgroepGewijzigd',
  prijsgroep_verwijderd: 'activiteitTypePrijsgroepVerwijderd',
  bedrijfsgegevens_gewijzigd: 'activiteitTypeBedrijfsgegevensGewijzigd',
  kunstenaar_toegevoegd: 'activiteitTypeKunstenaarToegevoegd',
  kunstenaar_gewijzigd: 'activiteitTypeKunstenaarGewijzigd',
  kunstenaar_verwijderd: 'activiteitTypeKunstenaarVerwijderd',
  klant_exclusiviteit_gewijzigd: 'activiteitTypeKlantExclusiviteitGewijzigd',
  drukker_toegevoegd: 'activiteitTypeDrukkerToegevoegd',
  drukker_gewijzigd: 'activiteitTypeDrukkerGewijzigd',
  drukker_verwijderd: 'activiteitTypeDrukkerVerwijderd',
  bestelling_verstuurd_naar_drukker: 'activiteitTypeBestellingVerstuurdNaarDrukker',
  bestelinstellingen_gewijzigd: 'activiteitTypeBestelinstellingenGewijzigd',
  klant_minimale_afname_gewijzigd: 'activiteitTypeKlantMinimaleAfnameGewijzigd',
  stijl_toegevoegd: 'activiteitTypeStijlToegevoegd',
  stijl_gewijzigd: 'activiteitTypeStijlGewijzigd',
  stijl_verwijderd: 'activiteitTypeStijlVerwijderd',
  onderwerp_toegevoegd: 'activiteitTypeOnderwerpToegevoegd',
  onderwerp_gewijzigd: 'activiteitTypeOnderwerpGewijzigd',
  onderwerp_verwijderd: 'activiteitTypeOnderwerpVerwijderd',
};

export function ActiviteitSection({ activiteiten, loadError }: ActiviteitSectionProps) {
  const t = useTranslations('beheer');

  const rows = useMemo<ActiviteitRow[]>(
    () =>
      (activiteiten ?? []).map((activiteit) => {
        const labelKey = TYPE_LABEL_KEYS[activiteit.type];
        return {
          id: activiteit.id,
          tijdstip: activiteit.timestamp ? activiteit.timestamp.toLocaleString('nl-NL') : '',
          typeLabel: labelKey ? t(labelKey) : activiteit.type,
          actorNaam: activiteit.actorNaam,
          actorEmail: activiteit.actorEmail,
        };
      }),
    [activiteiten, t]
  );

  const columns: Column<ActiviteitRow>[] = [
    { key: 'tijdstip', label: t('activiteitColTijdstip') },
    { key: 'typeLabel', label: t('activiteitColType') },
    { key: 'actorNaam', label: t('activiteitColKlant') },
    { key: 'actorEmail', label: t('activiteitColEmail') },
  ];

  return (
    <div data-testid="activiteit-section">
      {loadError && (
        <p data-testid="activiteit-load-error" className="mb-3 text-xs text-red-400">
          {loadError}
        </p>
      )}
      <DataTable<ActiviteitRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={() => {}}
        emptyLabel={t('activiteitEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
    </div>
  );
}
