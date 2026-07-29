'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Prijsgroep } from './materiaalTypes';
import type { Klant } from './KlantenSection';

interface PrijsgroepenSectionProps {
  prijsgroepen: Prijsgroep[] | null;
  klanten: Klant[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Prijsgroep, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; prijsgroep: Prijsgroep } | null;

export function PrijsgroepenSection({
  prijsgroepen,
  klanten,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: PrijsgroepenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [naam, setNaam] = useState('');
  const [kortingspercentage, setKortingspercentage] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (loadError) {
    return (
      <p data-testid="prijsgroepen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (prijsgroepen === null) {
    return null;
  }

  function openAdd() {
    setNaam('');
    setKortingspercentage('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(prijsgroep: Prijsgroep) {
    setNaam(prijsgroep.naam);
    setKortingspercentage(String(prijsgroep.kortingspercentage));
    setActionError(null);
    setModalState({ mode: 'edit', prijsgroep });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data = { naam, kortingspercentage: Number(kortingspercentage) };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.prijsgroep.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'prijsgroep_toegevoegd' : 'prijsgroep_gewijzigd',
        actorFromMedewerker(user),
        naam
      );
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (klanten ?? []).some((klant) => klant.prijsgroepId === modalState.prijsgroep.id);
    if (inUse) {
      setActionError(t('prijsgroepenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.prijsgroep.id);
    if (success) {
      void logActiviteit('prijsgroep_verwijderd', actorFromMedewerker(user), modalState.prijsgroep.naam);
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }

  const columns: Column<Prijsgroep>[] = [
    { key: 'naam', label: t('prijsgroepenColNaam') },
    { key: 'kortingspercentage', label: t('prijsgroepenColKortingspercentage') },
  ];

  return (
    <div data-testid="prijsgroepen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="prijsgroepen-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('prijsgroepenToevoegen')}
        </button>
      </div>
      <DataTable<Prijsgroep>
        columns={columns}
        rows={prijsgroepen}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('prijsgroepenEmpty')}
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
              disabled={!naam}
              data-testid="prijsgroep-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('prijsgroepenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="prijsgroep-modal-verwijderen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('prijsgroepenVerwijderen')}
              </button>
            )}
          </>
        }
      >
        <div data-testid="prijsgroep-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('prijsgroepenLabelNaam')}
            <input
              type="text"
              value={naam}
              onChange={(event) => setNaam(event.target.value)}
              data-testid="prijsgroep-modal-naam"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('prijsgroepenLabelKortingspercentage')}
            <input
              type="number"
              value={kortingspercentage}
              onChange={(event) => setKortingspercentage(event.target.value)}
              data-testid="prijsgroep-modal-kortingspercentage"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="prijsgroep-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
