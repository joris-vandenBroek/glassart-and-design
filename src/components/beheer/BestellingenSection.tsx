'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { HelpHint } from '@/components/HelpHint';
import { BestellingModal } from './BestellingModal';
import { VersturenNaarDrukkerDialog } from './VersturenNaarDrukkerDialog';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Drukker } from './materiaalTypes';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';

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
  bestelnr: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen';
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
  btwTarieven: BtwTarieven | null;
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
  btwTarieven,
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
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (bestellingen === null) return;
    // Houdt alleen ids over die nog bestaan én nog de status van het actieve
    // filter hebben. Dit dekt in één keer drie gevallen af: een bestelling die
    // verdwijnt, een bestelling waarvan de status verandert (bijvoorbeeld nadat
    // hij is verstuurd of afgerond), en het wisselen van filter.
    const stillSelectable = new Set(
      bestellingen.filter((b) => b.status === statusFilter).map((b) => b.id)
    );
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => stillSelectable.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bestellingen, statusFilter]);

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

  const selectieActief =
    statusFilter === 'Te versturen naar drukker' || statusFilter === 'Verstuurd naar drukker';

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
          {statusFilter === 'Verstuurd naar drukker' ? (
            <button
              type="button"
              data-testid="bestellingen-afronden"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenAfronden')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowVersturenDialog(true)}
              data-testid="bestellingen-versturen-naar-drukker"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenVersturenNaarDrukker')}
            </button>
          )}
        </div>
      )}
      <div className="mb-3 flex items-center justify-end">
        <HelpHint text={t('bestellingenHelp')} testId="bestellingen-help" />
      </div>
      <DataTable<Bestelling>
        columns={columns}
        rows={bestellingen}
        getRowId={(row) => row.id}
        onRowClick={setSelectedBestelling}
        quickFilter={{
          key: 'status',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [
            {
              value: 'Te versturen naar drukker',
              label: t('bestellingenQuickTeVersturenNaarDrukker'),
              testId: 'te-versturen',
            },
            {
              value: 'Verstuurd naar drukker',
              label: t('bestellingenQuickVerstuurdNaarDrukker'),
              testId: 'verstuurd',
            },
            { value: '', label: t('bestellingenQuickAlle'), testId: 'alle' },
          ],
        }}
        selection={
          selectieActief
            ? {
                selectedIds,
                onToggle: handleToggle,
                onToggleAll: handleToggleAll,
                isSelectable: (row) => row.status === statusFilter,
              }
            : undefined
        }
        emptyLabel={t('bestellingenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <BestellingModal
        bestelling={selectedBestelling}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        materiaalsoorten={materiaalsoorten}
        klanten={klanten}
        btwTarieven={btwTarieven}
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
