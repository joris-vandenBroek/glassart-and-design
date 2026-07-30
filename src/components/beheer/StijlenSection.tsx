'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Stijl } from './materiaalTypes';

interface StijlenSectionProps {
  stijlen: Stijl[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; stijl: Stijl } | null;

export function StijlenSection({ stijlen, loadError, onAdd, onUpdate, onRemove }: StijlenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="stijlen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (stijlen === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(stijl: Stijl) {
    setOmschrijving(stijl.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', stijl });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add' ? await onAdd({ omschrijving }) : await onUpdate(modalState.stijl.id, { omschrijving });
    if (success) {
      void logActiviteit(modalState.mode === 'add' ? 'stijl_toegevoegd' : 'stijl_gewijzigd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('stijlenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.stijl.id);
    if (success) {
      void logActiviteit('stijl_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('stijlenActionError'));
    }
  }

  const columns: Column<Stijl>[] = [{ key: 'omschrijving', label: t('stijlenColOmschrijving') }];

  return (
    <div data-testid="stijlen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="stijlen-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('stijlenToevoegen')}
        </button>
      </div>
      <DataTable<Stijl>
        columns={columns}
        rows={stijlen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('stijlenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={modalState?.mode === 'edit' ? t('stijlenModalTitelBewerken') : t('stijlenModalTitelToevoegen')}
        footerActions={
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="stijl-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('stijlenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="stijl-modal-verwijderen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('stijlenVerwijderen')}
              </button>
            )}
          </>
        }
      >
        <div data-testid="stijl-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('stijlenLabelOmschrijving')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="stijl-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <RequiredLegend testId="stijl-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
            <p data-testid="stijl-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
