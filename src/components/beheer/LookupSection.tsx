'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { logActiviteit, type ActiviteitType } from '@/lib/logActiviteit';
import type { Kunstwerk } from './materiaalTypes';

/**
 * De gedeelde beheersectie voor de catalogustabellen die verder niets bevatten dan
 * de vier omschrijving-velden (Nl/Fr/De/En): segmenten, stijlen en onderwerpen.
 *
 * Die drie schermen waren regel voor regel identiek op de entiteitsnaam na --
 * inclusief de bevestigingsstroom voor verwijderen en de "nog in gebruik door N
 * kunstwerken"-telling. Eén afwijking had zich al ingesleten (`stijlIds` werd
 * defensief met `?? []` gelezen, `segmentIds` niet), wat precies laat zien
 * waarom dit één component hoort te zijn.
 *
 * Let op: de vertaalsleutels worden hier samengesteld (`${meervoud}Opslaan`), en
 * next-intl's `t()` neemt een gewone `string` -- een ontbrekende sleutel geeft
 * dus geen compilerfout maar de ruwe sleutelnaam in beeld. Voeg je een nieuwe
 * lookup toe, controleer dan of alle sleutels in `messages/*.json` bestaan.
 */
export interface LookupItem {
  id: string;
  omschrijvingNl: string;
  omschrijvingFr: string;
  omschrijvingDe: string;
  omschrijvingEn: string;
}

export interface LookupSectionProps<T extends LookupItem> {
  items: T[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<T, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<T, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  /** Enkelvoud, gebruikt voor de data-testids van de modal (`segment-modal`). */
  enkelvoud: string;
  /** Meervoud, gebruikt voor de vertaalsleutels en de sectie-testids. */
  meervoud: string;
  /** De kolom in `kunstwerken` die naar deze tabel verwijst. */
  kunstwerkIdsKey: 'segmentIds' | 'stijlIds' | 'onderwerpIds';
  /** Expliciet, niet samengesteld: ActiviteitType is een union van letterlijke waarden. */
  activiteitTypes: {
    toegevoegd: ActiviteitType;
    gewijzigd: ActiviteitType;
    verwijderd: ActiviteitType;
  };
}

type ModalState<T> = { mode: 'add' } | { mode: 'edit'; item: T } | null;

export function LookupSection<T extends LookupItem>({
  items,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
  enkelvoud,
  meervoud,
  kunstwerkIdsKey,
  activiteitTypes,
}: LookupSectionProps<T>) {
  const t = useTranslations('beheer');
  const [modalState, setModalState] = useState<ModalState<T>>(null);
  const [omschrijvingNl, setOmschrijvingNl] = useState('');
  const [omschrijvingFr, setOmschrijvingFr] = useState('');
  const [omschrijvingDe, setOmschrijvingDe] = useState('');
  const [omschrijvingEn, setOmschrijvingEn] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingVerwijderCount, setPendingVerwijderCount] = useState<number | null>(null);

  if (loadError) {
    return (
      <p data-testid={`${meervoud}-error`} className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (items === null) {
    return null;
  }

  function openAdd() {
    setOmschrijvingNl('');
    setOmschrijvingFr('');
    setOmschrijvingDe('');
    setOmschrijvingEn('');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(item: T) {
    setOmschrijvingNl(item.omschrijvingNl ?? '');
    setOmschrijvingFr(item.omschrijvingFr ?? '');
    setOmschrijvingDe(item.omschrijvingDe ?? '');
    setOmschrijvingEn(item.omschrijvingEn ?? '');
    setActionError(null);
    setPendingVerwijderCount(null);
    setModalState({ mode: 'edit', item });
  }

  function closeModal() {
    setModalState(null);
    setPendingVerwijderCount(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data = { omschrijvingNl, omschrijvingFr, omschrijvingDe, omschrijvingEn } as Omit<T, 'id'>;
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.item.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? activiteitTypes.toegevoegd : activiteitTypes.gewijzigd,
        omschrijvingNl
      );
      closeModal();
    } else {
      setActionError(t(`${meervoud}ActionError`));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    if (pendingVerwijderCount === null) {
      const inUseCount = (kunstwerken ?? []).filter((kunstwerk) =>
        (kunstwerk[kunstwerkIdsKey] ?? []).includes(modalState.item.id)
      ).length;
      if (inUseCount > 0) {
        setPendingVerwijderCount(inUseCount);
        return;
      }
    }
    const success = await onRemove(modalState.item.id);
    if (success) {
      void logActiviteit(activiteitTypes.verwijderd, modalState.item.omschrijvingNl);
      closeModal();
    } else {
      setActionError(t(`${meervoud}ActionError`));
    }
  }

  function handleAnnulerenVerwijderen() {
    setPendingVerwijderCount(null);
  }

  const columns: Column<T>[] = [{ key: 'omschrijvingNl', label: t(`${meervoud}ColOmschrijving`) }];

  return (
    <div data-testid={`${meervoud}-section`}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid={`${meervoud}-add`}
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t(`${meervoud}Toevoegen`)}
        </button>
      </div>
      <DataTable<T>
        columns={columns}
        rows={items}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t(`${meervoud}Empty`)}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={t(`${meervoud}ModalTitel`)}
        footerActions={
          modalState?.mode === 'edit' && pendingVerwijderCount !== null ? (
            <>
              <button
                type="button"
                onClick={handleRemove}
                data-testid={`${enkelvoud}-modal-verwijder-bevestigen`}
                className="btn-beheer-secondary rounded-sm border border-red-500/40 px-4 py-2 text-xs tracking-wide text-red-400 hover:border-red-500 hover:text-red-300"
              >
                {t('verwijderenBevestigen')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenVerwijderen}
                data-testid={`${enkelvoud}-modal-verwijder-annuleren`}
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
                disabled={!omschrijvingNl}
                data-testid={`${enkelvoud}-modal-opslaan`}
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t(`${meervoud}Opslaan`)}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid={`${enkelvoud}-modal-verwijderen`}
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                >
                  {t(`${meervoud}Verwijderen`)}
                </button>
              )}
            </>
          )
        }
      >
        <div data-testid={`${enkelvoud}-modal`} className="flex flex-col gap-2 text-sm text-white/80">
          {pendingVerwijderCount !== null ? (
            <p data-testid={`${enkelvoud}-modal-verwijder-bevestiging`}>
              {t(`${meervoud}VerwijderBevestiging`, { count: pendingVerwijderCount })}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                <span>
                  {t(`${meervoud}LabelOmschrijvingNl`)}
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  value={omschrijvingNl}
                  onChange={(event) => setOmschrijvingNl(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t(`${meervoud}LabelOmschrijvingFr`)}
                <input
                  type="text"
                  value={omschrijvingFr}
                  onChange={(event) => setOmschrijvingFr(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving-fr`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t(`${meervoud}LabelOmschrijvingDe`)}
                <input
                  type="text"
                  value={omschrijvingDe}
                  onChange={(event) => setOmschrijvingDe(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving-de`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t(`${meervoud}LabelOmschrijvingEn`)}
                <input
                  type="text"
                  value={omschrijvingEn}
                  onChange={(event) => setOmschrijvingEn(event.target.value)}
                  data-testid={`${enkelvoud}-modal-omschrijving-en`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>

              <RequiredLegend testId={`${enkelvoud}-modal-verplicht-legende`}>
                {t('verplichtVeldLegende')}
              </RequiredLegend>
            </>
          )}

          {actionError && (
            <p data-testid={`${enkelvoud}-modal-error`} className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
