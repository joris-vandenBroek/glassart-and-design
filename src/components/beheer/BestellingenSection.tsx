'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { BestellingModal } from './BestellingModal';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';

export interface BestellingLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}

export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}

interface BestellingenSectionProps {
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  loadError: string | null;
  onBestellingUpdated: (bestelling: Bestelling) => void;
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
  onLineUpdated: (bestellingId: string, lineId: string, updates: Partial<BestellingLine>) => void;
}

export function BestellingenSection({
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  loadError,
  onBestellingUpdated,
  onLinePrijsVastgesteld,
  onLineUpdated,
}: BestellingenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedBestelling, setSelectedBestelling] = useState<Bestelling | null>(null);

  function handleLinePrijsVastgesteld(bestellingId: string, lineId: string, prijs: number) {
    onLinePrijsVastgesteld(bestellingId, lineId, prijs);
    setSelectedBestelling((current) =>
      current && current.id === bestellingId
        ? { ...current, lines: current.lines.map((line) => (line.id === lineId ? { ...line, prijs } : line)) }
        : current
    );
  }

  function handleLineUpdated(bestellingId: string, lineId: string, updates: Partial<BestellingLine>) {
    onLineUpdated(bestellingId, lineId, updates);
    setSelectedBestelling((current) =>
      current && current.id === bestellingId
        ? { ...current, lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...updates } : line)) }
        : current
    );
  }

  if (loadError) {
    return (
      <p data-testid="bestellingen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (bestellingen === null) {
    return null;
  }

  const columns: Column<Bestelling>[] = [
    { key: 'companyName', label: t('bestellingenColKlant') },
    { key: 'besteldatum', label: t('bestellingenColDatum') },
    {
      key: 'lineCount',
      label: t('bestellingenColAantal'),
      render: (row) => `${row.lineCount} / ${row.totalQuantity}`,
    },
    { key: 'status', label: t('bestellingenColStatus') },
  ];

  return (
    <div data-testid="bestellingen-section">
      <DataTable<Bestelling>
        columns={columns}
        rows={bestellingen}
        getRowId={(row) => row.id}
        onRowClick={setSelectedBestelling}
        quickFilter={{
          key: 'status',
          activeValue: 'Te versturen naar drukker',
          activeLabel: t('bestellingenQuickTeVersturenNaarDrukker'),
          allLabel: t('bestellingenQuickAlle'),
          defaultActive: false,
        }}
        emptyLabel={t('bestellingenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <BestellingModal
        bestelling={selectedBestelling}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        materiaalsoorten={materiaalsoorten}
        onClose={() => setSelectedBestelling(null)}
        onUpdated={(updated) => {
          onBestellingUpdated(updated);
          setSelectedBestelling(null);
        }}
        onLinePrijsVastgesteld={handleLinePrijsVastgesteld}
        onLineUpdated={handleLineUpdated}
      />
    </div>
  );
}
