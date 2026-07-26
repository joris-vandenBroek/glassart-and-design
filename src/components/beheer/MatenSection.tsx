'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Maat, Kunstwerk } from './materiaalTypes';

interface MatenSectionProps {
  maten: Maat[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Maat, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Maat, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; maat: Maat } | null;

export function MatenSection({ maten, kunstwerken, loadError, onAdd, onUpdate, onRemove }: MatenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [breedte, setBreedte] = useState('');
  const [hoogte, setHoogte] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) {
    return (
      <p data-testid="maten-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (maten === null) {
    return null;
  }

  function openAdd() {
    setBreedte('');
    setHoogte('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(maat: Maat) {
    setBreedte(String(maat.breedte));
    setHoogte(String(maat.hoogte));
    setActionError(null);
    setModalState({ mode: 'edit', maat });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data = { breedte: Number(breedte), hoogte: Number(hoogte) };
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.maat.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'maat_toegevoegd' : 'maat_gewijzigd',
        actorFromMedewerker(user),
        `${breedte}×${hoogte} cm`
      );
      closeModal();
    } else {
      setActionError(t('matenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (kunstwerken ?? []).some((kunstwerk) => kunstwerk.maatIds.includes(modalState.maat.id));
    if (inUse) {
      setActionError(t('matenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.maat.id);
    if (success) {
      void logActiviteit(
        'maat_verwijderd',
        actorFromMedewerker(user),
        `${modalState.maat.breedte}×${modalState.maat.hoogte} cm`
      );
      closeModal();
    } else {
      setActionError(t('matenActionError'));
    }
  }

  const columns: Column<Maat>[] = [
    { key: 'breedte', label: t('matenColBreedte') },
    { key: 'hoogte', label: t('matenColHoogte') },
  ];

  return (
    <div data-testid="maten-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="maten-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('matenToevoegen')}
        </button>
      </div>
      <DataTable<Maat>
        columns={columns}
        rows={maten}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('matenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="maat-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('matenLabelBreedte')}
            <input
              type="number"
              value={breedte}
              onChange={(event) => setBreedte(event.target.value)}
              data-testid="maat-modal-breedte"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('matenLabelHoogte')}
            <input
              type="number"
              value={hoogte}
              onChange={(event) => setHoogte(event.target.value)}
              data-testid="maat-modal-hoogte"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="maat-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!breedte || !hoogte || Number(breedte) <= 0 || Number(hoogte) <= 0}
              data-testid="maat-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('matenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="maat-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('matenVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
