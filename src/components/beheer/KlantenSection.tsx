'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { KlantModal } from './KlantModal';
import type { Prijsgroep } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';
import type { BtwTarieven } from './btwTarievenTypes';

export interface Klant {
  id: string;
  companyName: string;
  kvk: string;
  btwNummer?: string | null;
  contactPerson: string;
  email: string;
  phone: string;
  contactPreference: string;
  address: string;
  postcode: string;
  city: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  deliveryCity: string;
  invoiceAddress: string;
  invoicePostcode: string;
  invoiceCity: string;
  land?: string | null;
  invoiceLand?: string | null;
  klantnr?: string | null;
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
  kunstenaarnr: string | null;
  minimaleAfname?: number | null;
  afwijsreden?: string | null;
}

interface KlantenSectionProps {
  klanten: Klant[] | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  btwTarieven: BtwTarieven | null;
  btwLoadError: boolean;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
}

export function KlantenSection({
  klanten,
  prijsgroepen,
  kunstenaars,
  btwTarieven,
  btwLoadError,
  loadError,
  onKlantUpdated,
}: KlantenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedKlant, setSelectedKlant] = useState<Klant | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  if (loadError) {
    return (
      <p data-testid="klanten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (klanten === null) {
    return null;
  }

  const columns: Column<Klant>[] = [
    { key: 'klantnr', label: t('klantenColKlantnr') },
    { key: 'companyName', label: t('klantenColCompanyName') },
    { key: 'kvk', label: t('klantenColKvk') },
    { key: 'btwNummer', label: t('klantenColBtwNummer') },
    { key: 'contactPerson', label: t('klantenColContactPerson') },
    { key: 'email', label: t('klantenColEmail') },
    { key: 'phone', label: t('klantenColPhone') },
    { key: 'status', label: t('klantenColStatus') },
  ];

  return (
    <div data-testid="klanten-section">
      <DataTable<Klant>
        columns={columns}
        rows={klanten}
        getRowId={(row) => row.id}
        onRowClick={setSelectedKlant}
        // Matches de bestellingenscreen, dat ook standaard op zijn nummerkolom
        // sorteert (daar aflopend, want daar telt de nieuwste bestelling).
        defaultSortKey="klantnr"
        quickFilter={{
          key: 'status',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [
            { value: 'Beoordelen', label: t('klantenQuickTeBeoordelen'), testId: 'te-beoordelen' },
            { value: '', label: t('klantenQuickAlle'), testId: 'alle' },
          ],
        }}
        emptyLabel={t('klantenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <KlantModal
        klant={selectedKlant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        klanten={klanten}
        btwTarieven={btwTarieven}
        btwLoadError={btwLoadError}
        onClose={() => setSelectedKlant(null)}
        onUpdated={(updated) => {
          onKlantUpdated(updated);
          setSelectedKlant(null);
        }}
      />
    </div>
  );
}
