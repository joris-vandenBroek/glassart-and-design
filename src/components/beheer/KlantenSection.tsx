'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { KlantModal } from './KlantModal';
import type { Prijsgroep } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';

export interface Klant {
  id: string;
  companyName: string;
  kvk: string;
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
  status: 'Beoordelen' | 'Goedgekeurd' | 'Afgewezen';
  prijsgroepId: string | null;
  exclusieveKunstenaarIds: string[];
  minimaleAfname?: number | null;
}

interface KlantenSectionProps {
  klanten: Klant[] | null;
  prijsgroepen: Prijsgroep[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  onKlantUpdated: (klant: Klant) => void;
  onKunstenaarUpdated: (id: string, data: Partial<Omit<Kunstenaar, 'id'>>) => Promise<boolean>;
}

export function KlantenSection({
  klanten,
  prijsgroepen,
  kunstenaars,
  loadError,
  onKlantUpdated,
  onKunstenaarUpdated,
}: KlantenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedKlant, setSelectedKlant] = useState<Klant | null>(null);

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
    { key: 'companyName', label: t('klantenColCompanyName') },
    { key: 'kvk', label: t('klantenColKvk') },
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
        quickFilter={{
          key: 'status',
          activeValue: 'Beoordelen',
          activeLabel: t('klantenQuickTeBeoordelen'),
          allLabel: t('klantenQuickAlle'),
          defaultActive: false,
        }}
        emptyLabel={t('klantenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <KlantModal
        klant={selectedKlant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        onKunstenaarUpdated={onKunstenaarUpdated}
        onClose={() => setSelectedKlant(null)}
        onUpdated={(updated) => {
          onKlantUpdated(updated);
          setSelectedKlant(null);
        }}
      />
    </div>
  );
}
