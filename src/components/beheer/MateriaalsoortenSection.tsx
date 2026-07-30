'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Materiaalsoort, Materiaal } from './materiaalTypes';

interface MateriaalsoortenSectionProps {
  materiaalsoorten: Materiaalsoort[] | null;
  materialen: Materiaal[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaalsoort, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; materiaalsoort: Materiaalsoort } | null;

export function MateriaalsoortenSection({
  materiaalsoorten,
  materialen,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: MateriaalsoortenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [staatEigenMaatToe, setStaatEigenMaatToe] = useState(false);
  const [maxBreedte, setMaxBreedte] = useState('');
  const [maxHoogte, setMaxHoogte] = useState('');
  const [levertijdMaanden, setLevertijdMaanden] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="materiaalsoorten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (materiaalsoorten === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setStaatEigenMaatToe(false);
    setMaxBreedte('');
    setMaxHoogte('');
    setLevertijdMaanden('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaalsoort: Materiaalsoort) {
    setOmschrijving(materiaalsoort.omschrijving);
    setStaatEigenMaatToe(materiaalsoort.staatEigenMaatToe ?? false);
    setMaxBreedte(materiaalsoort.maxBreedte != null ? String(materiaalsoort.maxBreedte) : '');
    setMaxHoogte(materiaalsoort.maxHoogte != null ? String(materiaalsoort.maxHoogte) : '');
    setLevertijdMaanden(
      materiaalsoort.levertijdMaandenEigenMaat != null ? String(materiaalsoort.levertijdMaandenEigenMaat) : ''
    );
    setActionError(null);
    setModalState({ mode: 'edit', materiaalsoort });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data: Omit<Materiaalsoort, 'id'> = {
      omschrijving,
      staatEigenMaatToe,
      maxBreedte: staatEigenMaatToe && maxBreedte ? Number(maxBreedte) : null,
      maxHoogte: staatEigenMaatToe && maxHoogte ? Number(maxHoogte) : null,
      levertijdMaandenEigenMaat: staatEigenMaatToe && levertijdMaanden ? Number(levertijdMaanden) : null,
    };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.materiaalsoort.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaalsoort_toegevoegd' : 'materiaalsoort_gewijzigd',
        actorFromMedewerker(user),
        omschrijving
      );
      closeModal();
    } else {
      setActionError(t('materiaalsoortenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (materialen ?? []).some(
      (materiaal) => materiaal.materiaalsoortId === modalState.materiaalsoort.id
    );
    if (inUse) {
      setActionError(t('materiaalsoortenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.materiaalsoort.id);
    if (success) {
      void logActiviteit('materiaalsoort_verwijderd', actorFromMedewerker(user), modalState.materiaalsoort.omschrijving);
      closeModal();
    } else {
      setActionError(t('materiaalsoortenActionError'));
    }
  }

  const columns: Column<Materiaalsoort>[] = [{ key: 'omschrijving', label: t('materiaalsoortenColOmschrijving') }];

  return (
    <div data-testid="materiaalsoorten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="materiaalsoorten-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('materiaalsoortenToevoegen')}
        </button>
      </div>
      <DataTable<Materiaalsoort>
        columns={columns}
        rows={materiaalsoorten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('materiaalsoortenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('materiaalsoortenModalTitelBewerken') : t('materiaalsoortenModalTitelToevoegen')}
        footerActions={
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="materiaalsoort-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('materiaalsoortenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="materiaalsoort-modal-verwijderen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('materiaalsoortenVerwijderen')}
              </button>
            )}
          </>
        }
      >
        <div data-testid="materiaalsoort-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materiaalsoortenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="materiaalsoort-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
            <input
              type="checkbox"
              checked={staatEigenMaatToe}
              onChange={(event) => setStaatEigenMaatToe(event.target.checked)}
              data-testid="materiaalsoort-modal-eigen-maat"
            />
            {t('materiaalsoortenLabelStaatEigenMaatToe')}
          </label>

          {staatEigenMaatToe && (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('materiaalsoortenLabelMaxBreedte')}
                <input
                  type="number"
                  value={maxBreedte}
                  onChange={(event) => setMaxBreedte(event.target.value)}
                  data-testid="materiaalsoort-modal-max-breedte"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('materiaalsoortenLabelMaxHoogte')}
                <input
                  type="number"
                  value={maxHoogte}
                  onChange={(event) => setMaxHoogte(event.target.value)}
                  data-testid="materiaalsoort-modal-max-hoogte"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('materiaalsoortenLabelLevertijdMaanden')}
                <input
                  type="number"
                  value={levertijdMaanden}
                  onChange={(event) => setLevertijdMaanden(event.target.value)}
                  data-testid="materiaalsoort-modal-levertijd-maanden"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
            </>
          )}

          {actionError && (
            <p data-testid="materiaalsoort-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
