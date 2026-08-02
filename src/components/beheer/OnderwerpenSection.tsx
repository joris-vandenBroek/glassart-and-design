'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Onderwerp, Kunstwerk } from './materiaalTypes';

interface OnderwerpenSectionProps {
  onderwerpen: Onderwerp[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; onderwerp: Onderwerp } | null;

export function OnderwerpenSection({
  onderwerpen,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: OnderwerpenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingVerwijderCount, setPendingVerwijderCount] = useState<number | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="onderwerpen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (onderwerpen === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(onderwerp: Onderwerp) {
    setOmschrijving(onderwerp.omschrijving);
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'edit', onderwerp });
  }

  function closeModal() {
    setModalState(null);
    setPendingVerwijderCount(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.onderwerp.id, { omschrijving });
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'onderwerp_toegevoegd' : 'onderwerp_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('onderwerpenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    if (pendingVerwijderCount === null) {
      const inUseCount = (kunstwerken ?? []).filter((kunstwerk) =>
        (kunstwerk.onderwerpIds ?? []).includes(modalState.onderwerp.id)
      ).length;
      if (inUseCount > 0) {
        setPendingVerwijderCount(inUseCount);
        return;
      }
    }
    const success = await onRemove(modalState.onderwerp.id);
    if (success) {
      void logActiviteit('onderwerp_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('onderwerpenActionError'));
    }
  }

  function handleAnnulerenVerwijderen() {
    setPendingVerwijderCount(null);
  }

  const columns: Column<Onderwerp>[] = [{ key: 'omschrijving', label: t('onderwerpenColOmschrijving') }];

  return (
    <div data-testid="onderwerpen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="onderwerpen-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('onderwerpenToevoegen')}
        </button>
      </div>
      <DataTable<Onderwerp>
        columns={columns}
        rows={onderwerpen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('onderwerpenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('onderwerpenModalTitelBewerken') : t('onderwerpenModalTitelToevoegen')}
        footerActions={
          modalState?.mode === 'edit' && pendingVerwijderCount !== null ? (
            <>
              <button
                type="button"
                onClick={handleRemove}
                data-testid="onderwerp-modal-verwijder-bevestigen"
                className="btn-beheer-secondary rounded-sm border border-red-500/40 px-4 py-2 text-xs tracking-wide text-red-400 hover:border-red-500 hover:text-red-300"
              >
                {t('verwijderenBevestigen')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenVerwijderen}
                data-testid="onderwerp-modal-verwijder-annuleren"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('annuleren')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!omschrijving}
                data-testid="onderwerp-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('onderwerpenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid="onderwerp-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t('onderwerpenVerwijderen')}
                </button>
              )}
            </>
          )
        }
      >
        <div data-testid="onderwerp-modal" className="flex flex-col gap-2 text-sm text-white/80">
          {pendingVerwijderCount !== null ? (
            <p data-testid="onderwerp-modal-verwijder-bevestiging">
              {t('onderwerpenVerwijderBevestiging', { count: pendingVerwijderCount })}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                <span>
                  {t('onderwerpenLabelOmschrijving')}
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  value={omschrijving}
                  onChange={(event) => setOmschrijving(event.target.value)}
                  data-testid="onderwerp-modal-omschrijving"
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>

              <RequiredLegend testId="onderwerp-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>
            </>
          )}

          {actionError && (
            <p data-testid="onderwerp-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
