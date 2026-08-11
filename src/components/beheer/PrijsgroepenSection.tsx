'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { HelpHint } from '@/components/HelpHint';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
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
type PrijsgroepType = 'korting' | 'opslag';

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
  const [type, setType] = useState<PrijsgroepType>('korting');
  const [percentage, setPercentage] = useState('');
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
    setType('korting');
    setPercentage('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(prijsgroep: Prijsgroep) {
    setNaam(prijsgroep.naam);
    if (prijsgroep.kortingspercentage != null) {
      setType('korting');
      setPercentage(String(prijsgroep.kortingspercentage));
    } else {
      setType('opslag');
      setPercentage(String(prijsgroep.opslagpercentage ?? ''));
    }
    setActionError(null);
    setModalState({ mode: 'edit', prijsgroep });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data =
      type === 'korting'
        ? { naam, kortingspercentage: Number(percentage), opslagpercentage: null }
        : { naam, kortingspercentage: null, opslagpercentage: Number(percentage) };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.prijsgroep.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'prijsgroep_toegevoegd' : 'prijsgroep_gewijzigd',
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
      void logActiviteit('prijsgroep_verwijderd', modalState.prijsgroep.naam);
      closeModal();
    } else {
      setActionError(t('prijsgroepenActionError'));
    }
  }

  const columns: Column<Prijsgroep>[] = [
    { key: 'naam', label: t('prijsgroepenColNaam') },
    {
      key: 'kortingspercentage',
      label: t('prijsgroepenColType'),
      sortable: false,
      render: (row) => (row.kortingspercentage != null ? t('prijsgroepenTypeKorting') : t('prijsgroepenTypeOpslag')),
    },
    {
      key: 'opslagpercentage',
      label: t('prijsgroepenColPercentage'),
      sortable: false,
      render: (row) => `${Number(row.kortingspercentage ?? row.opslagpercentage)}%`,
    },
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
        title={
          <span className="inline-flex items-center gap-2">
            {t('prijsgroepenModalTitel')}
            <HelpHint text={t('prijsgroepenHelp')} testId="prijsgroep-modal-help" />
          </span>
        }
        footerActions={
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={!naam || !percentage}
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
            <span>
              {t('prijsgroepenLabelNaam')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={naam}
              onChange={(event) => setNaam(event.target.value)}
              data-testid="prijsgroep-modal-naam"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('prijsgroepenLabelType')}
            <select
              value={type}
              onChange={(event) => setType(event.target.value as PrijsgroepType)}
              data-testid="prijsgroep-modal-type"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="korting">{t('prijsgroepenTypeKorting')}</option>
              <option value="opslag">{t('prijsgroepenTypeOpslag')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('prijsgroepenLabelPercentage')}
            <input
              type="number"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
              data-testid="prijsgroep-modal-percentage"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <RequiredLegend testId="prijsgroep-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

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
