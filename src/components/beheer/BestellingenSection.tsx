'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { BestellingModal } from './BestellingModal';
import { VersturenNaarDrukkerDialog } from './VersturenNaarDrukkerDialog';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Drukker } from './materiaalTypes';
import type { Klant } from './KlantenSection';

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
  klanten: Klant[] | null;
  drukkers: Drukker[] | null;
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
  klanten,
  drukkers,
  loadError,
  onBestellingUpdated,
  onLinePrijsVastgesteld,
  onLineUpdated,
}: BestellingenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedBestelling, setSelectedBestelling] = useState<Bestelling | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showVersturenDialog, setShowVersturenDialog] = useState(false);

  useEffect(() => {
    if (bestellingen === null) return;
    const stillSelectable = new Set(
      bestellingen.filter((b) => b.status === 'Te versturen naar drukker').map((b) => b.id)
    );
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => stillSelectable.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bestellingen]);

  function handleToggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAll(ids: string[]) {
    setSelectedIds((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      const next = new Set(current);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

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
      {selectedIds.size > 0 && (
        <div
          data-testid="bestellingen-selectie-balk"
          className="mb-3 flex items-center justify-between gap-3 rounded-sm bg-white/5 px-3 py-2 text-xs"
        >
          <span>
            {t('bestellingenGeselecteerd', {
              count: selectedIds.size,
              klanten: new Set(
                bestellingen.filter((b) => selectedIds.has(b.id)).map((b) => b.klantId)
              ).size,
            })}
          </span>
          <button
            type="button"
            onClick={() => setShowVersturenDialog(true)}
            data-testid="bestellingen-versturen-naar-drukker"
            className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
          >
            {t('bestellingenVersturenNaarDrukker')}
          </button>
        </div>
      )}
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
        selection={{
          selectedIds,
          onToggle: handleToggle,
          onToggleAll: handleToggleAll,
          isSelectable: (row) => row.status === 'Te versturen naar drukker',
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
      <VersturenNaarDrukkerDialog
        isOpen={showVersturenDialog}
        onClose={() => setShowVersturenDialog(false)}
        bestellingen={bestellingen.filter((b) => selectedIds.has(b.id))}
        klanten={klanten ?? []}
        drukkers={drukkers ?? []}
        kunstwerken={kunstwerken ?? []}
        materialen={materialen ?? []}
        maten={maten ?? []}
        materiaalsoorten={materiaalsoorten ?? []}
        onVerstuurd={(updated) => {
          updated.forEach(onBestellingUpdated);
          setSelectedIds(new Set());
          setShowVersturenDialog(false);
        }}
      />
    </div>
  );
}
