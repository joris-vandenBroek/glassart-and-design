'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { DrukkerModal } from './DrukkerModal';
import type { Drukker } from './materiaalTypes';
import type { Bestelling } from './BestellingenSection';

interface DrukkersSectionProps {
  drukkers: Drukker[] | null;
  bestellingen: Bestelling[];
  loadError: string | null;
  onAdd: (data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Drukker, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onBestellingUpdated: (bestelling: Bestelling) => void;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; drukker: Drukker } | null;

export function DrukkersSection({
  drukkers,
  bestellingen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
  onBestellingUpdated,
}: DrukkersSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);

  if (loadError) {
    return (
      <p data-testid="drukkers-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (drukkers === null) {
    return null;
  }

  const columns: Column<Drukker>[] = [
    {
      key: 'naam',
      label: t('drukkersColNaam'),
      render: (drukker) => (
        <span className="flex items-center gap-2">
          {drukker.naam}
          {drukker.standaard && (
            <span
              data-testid={`drukker-standaard-badge-${drukker.id}`}
              className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
            >
              {t('drukkersStandaardBadge')}
            </span>
          )}
        </span>
      ),
    },
    { key: 'plaats', label: t('drukkersColPlaats') },
    { key: 'email', label: t('drukkersColEmail') },
  ];

  return (
    <div data-testid="drukkers-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setModalState({ mode: 'add' })}
          data-testid="drukkers-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('drukkersToevoegen')}
        </button>
      </div>
      <DataTable<Drukker>
        columns={columns}
        rows={drukkers}
        getRowId={(row) => row.id}
        onRowClick={(drukker) => setModalState({ mode: 'edit', drukker })}
        emptyLabel={t('drukkersEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <DrukkerModal
        state={modalState}
        bestellingen={bestellingen}
        onClose={() => setModalState(null)}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
      />
    </div>
  );
}
