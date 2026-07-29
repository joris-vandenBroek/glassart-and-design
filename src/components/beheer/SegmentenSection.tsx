'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Segment } from './materiaalTypes';

interface SegmentenSectionProps {
  segmenten: Segment[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Segment, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Segment, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; segment: Segment } | null;

export function SegmentenSection({ segmenten, loadError, onAdd, onUpdate, onRemove }: SegmentenSectionProps) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [omschrijving, setOmschrijving] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useAdminAuth();

  if (loadError) {
    return (
      <p data-testid="segmenten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (segmenten === null) {
    return null;
  }

  function openAdd() {
    setOmschrijving('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(segment: Segment) {
    setOmschrijving(segment.omschrijving);
    setActionError(null);
    setModalState({ mode: 'edit', segment });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const success =
      modalState.mode === 'add'
        ? await onAdd({ omschrijving })
        : await onUpdate(modalState.segment.id, { omschrijving });
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'segment_toegevoegd' : 'segment_gewijzigd',
        actorFromMedewerker(user),
        omschrijving
      );
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.segment.id);
    if (success) {
      void logActiviteit('segment_verwijderd', actorFromMedewerker(user), modalState.segment.omschrijving);
      closeModal();
    } else {
      setActionError(t('segmentenActionError'));
    }
  }

  const columns: Column<Segment>[] = [{ key: 'omschrijving', label: t('segmentenColOmschrijving') }];

  return (
    <div data-testid="segmenten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="segmenten-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('segmentenToevoegen')}
        </button>
      </div>
      <DataTable<Segment>
        columns={columns}
        rows={segmenten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('segmentenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        footerActions={
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={!omschrijving}
              data-testid="segment-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('segmentenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="segment-modal-verwijderen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('segmentenVerwijderen')}
              </button>
            )}
          </>
        }
      >
        <div data-testid="segment-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('segmentenLabelOmschrijving')}
            <input
              type="text"
              value={omschrijving}
              onChange={(event) => setOmschrijving(event.target.value)}
              data-testid="segment-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="segment-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
