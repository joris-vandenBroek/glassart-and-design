'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import type { Materiaal, Materiaalsoort, Kunstwerk } from './materiaalTypes';

interface MaterialenSectionProps {
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; materiaal: Materiaal } | null;
type MateriaalRow = Materiaal & { materiaalsoortNaam: string };

export function MaterialenSection({
  materialen,
  materiaalsoorten,
  kunstwerken,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: MaterialenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [materiaalsoortId, setMateriaalsoortId] = useState('');
  const [materiaaldikte, setMateriaaldikte] = useState('');
  const [omschrijvingNl, setOmschrijvingNl] = useState('');
  const [omschrijvingFr, setOmschrijvingFr] = useState('');
  const [omschrijvingDe, setOmschrijvingDe] = useState('');
  const [omschrijvingEn, setOmschrijvingEn] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const soortNameById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijvingNl));
    return map;
  }, [materiaalsoorten]);

  if (loadError) {
    return (
      <p data-testid="materialen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (materialen === null) {
    return null;
  }

  const rows: MateriaalRow[] = materialen.map((materiaal) => ({
    ...materiaal,
    materiaalsoortNaam: soortNameById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId,
  }));

  function openAdd() {
    setMateriaalsoortId((materiaalsoorten ?? [])[0]?.id ?? '');
    setMateriaaldikte('');
    setOmschrijvingNl('');
    setOmschrijvingFr('');
    setOmschrijvingDe('');
    setOmschrijvingEn('');
    setActionError(null);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaal: Materiaal) {
    setMateriaalsoortId(materiaal.materiaalsoortId);
    setMateriaaldikte(String(materiaal.materiaaldikte));
    setOmschrijvingNl(materiaal.omschrijvingNl ?? '');
    setOmschrijvingFr(materiaal.omschrijvingFr ?? '');
    setOmschrijvingDe(materiaal.omschrijvingDe ?? '');
    setOmschrijvingEn(materiaal.omschrijvingEn ?? '');
    setActionError(null);
    setModalState({ mode: 'edit', materiaal });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    const data = {
      materiaalsoortId,
      materiaaldikte: Number(materiaaldikte),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    const success =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.materiaal.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'materiaal_toegevoegd' : 'materiaal_gewijzigd',
        omschrijvingNl
      );
      closeModal();
    } else {
      setActionError(t('materialenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const inUse = (kunstwerken ?? []).some((kunstwerk) =>
      kunstwerk.materiaalIds.includes(modalState.materiaal.id)
    );
    if (inUse) {
      setActionError(t('materialenVerwijderBlocked'));
      return;
    }
    const success = await onRemove(modalState.materiaal.id);
    if (success) {
      void logActiviteit('materiaal_verwijderd', modalState.materiaal.omschrijvingNl);
      closeModal();
    } else {
      setActionError(t('materialenActionError'));
    }
  }

  const columns: Column<MateriaalRow>[] = [
    { key: 'materiaalsoortNaam', label: t('materialenColMateriaalsoort') },
    { key: 'materiaaldikte', label: t('materialenColDikte') },
    { key: 'omschrijvingNl', label: t('materialenColOmschrijving') },
  ];

  return (
    <div data-testid="materialen-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="materialen-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('materialenToevoegen')}
        </button>
      </div>
      <DataTable<MateriaalRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('materialenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={t('materialenModalTitel')}
        footerActions={
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={!materiaalsoortId || materiaaldikte === '' || !omschrijvingNl}
              data-testid="materiaal-modal-opslaan"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('materialenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="materiaal-modal-verwijderen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('materialenVerwijderen')}
              </button>
            )}
          </>
        }
      >
        <div data-testid="materiaal-modal" className="flex flex-col gap-2 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('materialenLabelMateriaalsoort')}
              <RequiredMark />
            </span>
            <select
              value={materiaalsoortId}
              onChange={(event) => setMateriaalsoortId(event.target.value)}
              data-testid="materiaal-modal-materiaalsoort"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              {(materiaalsoorten ?? []).map((soort) => (
                <option key={soort.id} value={soort.id}>
                  {soort.omschrijvingNl}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('materialenLabelDikte')}
              <RequiredMark />
            </span>
            <input
              type="number"
              value={materiaaldikte}
              onChange={(event) => setMateriaaldikte(event.target.value)}
              data-testid="materiaal-modal-dikte"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('materialenLabelOmschrijvingNl')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="materiaal-modal-omschrijving"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelOmschrijvingFr')}
            <input
              type="text"
              value={omschrijvingFr}
              onChange={(event) => setOmschrijvingFr(event.target.value)}
              data-testid="materiaal-modal-omschrijving-fr"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelOmschrijvingDe')}
            <input
              type="text"
              value={omschrijvingDe}
              onChange={(event) => setOmschrijvingDe(event.target.value)}
              data-testid="materiaal-modal-omschrijving-de"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('materialenLabelOmschrijvingEn')}
            <input
              type="text"
              value={omschrijvingEn}
              onChange={(event) => setOmschrijvingEn(event.target.value)}
              data-testid="materiaal-modal-omschrijving-en"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <RequiredLegend testId="materiaal-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {actionError && (
            <p data-testid="materiaal-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
