'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { KunstwerkSpecCard } from '@/components/KunstwerkSpecCard';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Kunstwerk, Segment, Materiaal, Materiaalsoort, Maat, PrijsRegel, KunstwerkFormaat } from './materiaalTypes';
import { isVierkanteMaat } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';
import { detectFormaatFromFile, detectFormaatFromImageUrl } from '@/lib/detectKunstwerkFormaat';

interface KunstwerkenSectionProps {
  kunstwerken: Kunstwerk[] | null;
  segmenten: Segment[] | null;
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  maten: Maat[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  onAdd: (data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; kunstwerk: Kunstwerk } | null;
type PrijzenState = Record<string, string>;
type KunstwerkRow = Kunstwerk & { segmentNamen: string; kunstenaarNaam: string };

function prijsKey(materiaalId: string, maatId: string) {
  return `${materiaalId}:${maatId}`;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

const LEGE_FORM = {
  foto: '',
  naam: '',
  kunstenaarId: '' as string,
  formaat: null as KunstwerkFormaat | null,
  segmentIds: [] as string[],
  materiaalIds: [] as string[],
  maatIds: [] as string[],
  prijzen: {} as PrijzenState,
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};

export function KunstwerkenSection({
  kunstwerken,
  segmenten,
  materialen,
  materiaalsoorten,
  maten,
  kunstenaars,
  loadError,
  onAdd,
  onUpdate,
  onRemove,
}: KunstwerkenSectionProps) {
  const t = useTranslations('beheer');
  const { uploading, error: fotoUploadError, upload } = useKunstwerkFotoUpload();
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [foto, setFoto] = useState(LEGE_FORM.foto);
  const [naam, setNaam] = useState(LEGE_FORM.naam);
  const [kunstenaarId, setKunstenaarId] = useState(LEGE_FORM.kunstenaarId);
  const [formaat, setFormaatState] = useState<KunstwerkFormaat | null>(LEGE_FORM.formaat);
  const [segmentIds, setSegmentIds] = useState<string[]>(LEGE_FORM.segmentIds);
  const [materiaalIds, setMateriaalIds] = useState<string[]>(LEGE_FORM.materiaalIds);
  const [maatIds, setMaatIds] = useState<string[]>(LEGE_FORM.maatIds);
  const [prijzen, setPrijzen] = useState<PrijzenState>(LEGE_FORM.prijzen);
  const [omschrijvingNl, setOmschrijvingNl] = useState(LEGE_FORM.omschrijvingNl);
  const [omschrijvingFr, setOmschrijvingFr] = useState(LEGE_FORM.omschrijvingFr);
  const [omschrijvingDe, setOmschrijvingDe] = useState(LEGE_FORM.omschrijvingDe);
  const [omschrijvingEn, setOmschrijvingEn] = useState(LEGE_FORM.omschrijvingEn);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDraggingFoto, setIsDraggingFoto] = useState(false);
  const [backfillBezig, setBackfillBezig] = useState(false);
  const formaatSessionRef = useRef(0);

  const segmentNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (segmenten ?? []).forEach((segment) => map.set(segment.id, segment.omschrijving));
    return map;
  }, [segmenten]);

  const materiaalsoortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
    return map;
  }, [materiaalsoorten]);

  const kunstenaarNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (kunstenaars ?? []).forEach((kunstenaar) => map.set(kunstenaar.id, kunstenaar.naam));
    return map;
  }, [kunstenaars]);

  function materiaalLabel(materiaal: Materiaal): string {
    const soortNaam = materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId;
    return `${materiaal.materiaaldikte}mm — ${soortNaam}`;
  }

  function setFormaat(optie: KunstwerkFormaat) {
    setFormaatState(optie);
    setMaatIds((current) =>
      current.filter((id) => {
        const maat = (maten ?? []).find((m) => m.id === id);
        if (!maat) return true;
        return optie === 'vierkant' ? isVierkanteMaat(maat) : !isVierkanteMaat(maat);
      })
    );
  }

  if (loadError) {
    return (
      <p data-testid="kunstwerken-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (kunstwerken === null) {
    return null;
  }

  const rows: KunstwerkRow[] = kunstwerken.map((kunstwerk) => ({
    ...kunstwerk,
    segmentNamen: kunstwerk.segmentIds.map((id) => segmentNaamById.get(id) ?? id).join(', '),
    kunstenaarNaam: kunstwerk.kunstenaarId ? kunstenaarNaamById.get(kunstwerk.kunstenaarId) ?? '' : '',
  }));

  function resetForm() {
    setFoto(LEGE_FORM.foto);
    setNaam(LEGE_FORM.naam);
    setKunstenaarId(LEGE_FORM.kunstenaarId);
    setFormaatState(LEGE_FORM.formaat);
    setSegmentIds(LEGE_FORM.segmentIds);
    setMateriaalIds(LEGE_FORM.materiaalIds);
    setMaatIds(LEGE_FORM.maatIds);
    setPrijzen(LEGE_FORM.prijzen);
    setOmschrijvingNl(LEGE_FORM.omschrijvingNl);
    setOmschrijvingFr(LEGE_FORM.omschrijvingFr);
    setOmschrijvingDe(LEGE_FORM.omschrijvingDe);
    setOmschrijvingEn(LEGE_FORM.omschrijvingEn);
    setActionError(null);
  }

  function openAdd() {
    formaatSessionRef.current += 1;
    resetForm();
    setModalState({ mode: 'add' });
  }

  function openEdit(kunstwerk: Kunstwerk) {
    formaatSessionRef.current += 1;
    const session = formaatSessionRef.current;
    setFoto(kunstwerk.foto);
    setNaam(kunstwerk.naam ?? '');
    setKunstenaarId(kunstwerk.kunstenaarId ?? '');
    setSegmentIds(kunstwerk.segmentIds);
    setMateriaalIds(kunstwerk.materiaalIds);
    setMaatIds(kunstwerk.maatIds);
    const prijzenMap: PrijzenState = {};
    kunstwerk.prijzen.forEach((regel) => {
      prijzenMap[prijsKey(regel.materiaalId, regel.maatId)] = String(regel.prijs);
    });
    setPrijzen(prijzenMap);
    setOmschrijvingNl(kunstwerk.omschrijvingNl);
    setOmschrijvingFr(kunstwerk.omschrijvingFr);
    setOmschrijvingDe(kunstwerk.omschrijvingDe);
    setOmschrijvingEn(kunstwerk.omschrijvingEn);
    setActionError(null);
    const bestaandFormaat = kunstwerk.formaat ?? null;
    setFormaatState(bestaandFormaat);
    if (!bestaandFormaat && kunstwerk.foto) {
      detectFormaatFromImageUrl(kunstwerk.foto).then((gedetecteerd) => {
        if (!gedetecteerd || formaatSessionRef.current !== session) return;
        const conflicteertMetOpgeslagenMaten = kunstwerk.maatIds.some((id) => {
          const maat = (maten ?? []).find((m) => m.id === id);
          if (!maat) return false;
          return gedetecteerd === 'vierkant' ? !isVierkanteMaat(maat) : isVierkanteMaat(maat);
        });
        if (!conflicteertMetOpgeslagenMaten) {
          setFormaat(gedetecteerd);
        }
      });
    }
    setModalState({ mode: 'edit', kunstwerk });
  }

  function closeModal() {
    formaatSessionRef.current += 1;
    setModalState(null);
  }

  async function handleFotoFile(file: File) {
    const session = formaatSessionRef.current;
    const url = await upload(file);
    if (url) {
      setFoto(url);
      const gedetecteerd = await detectFormaatFromFile(file);
      if (gedetecteerd && formaatSessionRef.current === session) {
        setFormaat(gedetecteerd);
      }
    }
  }

  async function handleFotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleFotoFile(file);
  }

  function handleFotoDragOver(event: React.DragEvent<HTMLSpanElement>) {
    event.preventDefault();
    setIsDraggingFoto(true);
  }

  function handleFotoDragLeave(event: React.DragEvent<HTMLSpanElement>) {
    event.preventDefault();
    setIsDraggingFoto(false);
  }

  async function handleFotoDrop(event: React.DragEvent<HTMLSpanElement>) {
    event.preventDefault();
    setIsDraggingFoto(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleFotoFile(file);
  }

  const prijsCombinaties = materiaalIds.flatMap((materiaalId) =>
    maatIds.map((maatId) => ({ materiaalId, maatId }))
  );
  const allePrijzenIngevuld = prijsCombinaties.every(
    ({ materiaalId, maatId }) => (prijzen[prijsKey(materiaalId, maatId)] ?? '') !== ''
  );
  const opslaanDisabled =
    !foto ||
    formaat === null ||
    uploading ||
    !naam ||
    segmentIds.length === 0 ||
    materiaalIds.length === 0 ||
    maatIds.length === 0 ||
    !allePrijzenIngevuld ||
    !omschrijvingNl;

  async function handleSave() {
    if (!modalState) return;
    const prijzenArray: PrijsRegel[] = prijsCombinaties.map(({ materiaalId, maatId }) => ({
      materiaalId,
      maatId,
      prijs: Number(prijzen[prijsKey(materiaalId, maatId)]),
    }));
    const data = {
      foto,
      naam,
      kunstenaarId: kunstenaarId || null,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds,
      prijzen: prijzenArray,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstwerk_toegevoegd' : 'kunstwerk_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    const success = await onRemove(modalState.kunstwerk.id);
    if (success) {
      void logActiviteit('kunstwerk_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('kunstwerkenActionError'));
    }
  }

  const kunstwerkenZonderNaam = kunstwerken.filter((kunstwerk) => !kunstwerk.naam);

  async function handleBackfillNamen() {
    setBackfillBezig(true);
    for (const kunstwerk of kunstwerkenZonderNaam) {
      const { id, ...data } = kunstwerk;
      const success = await onUpdate(id, { ...data, naam: kunstwerk.omschrijvingNl || kunstwerk.id });
      if (success) {
        void logActiviteit('kunstwerk_gewijzigd', actorFromMedewerker(user));
      }
    }
    setBackfillBezig(false);
  }

  const columns: Column<KunstwerkRow>[] = [
    {
      key: 'foto',
      label: t('kunstwerkenColFoto'),
      sortable: false,
      render: (row) => <img src={row.foto} alt="" className="h-10 w-10 rounded object-cover" />,
    },
    { key: 'naam', label: t('kunstwerkenColNaam') },
    { key: 'kunstenaarNaam', label: t('kunstwerkenColKunstenaar') },
    { key: 'segmentNamen', label: t('kunstwerkenColSegmenten') },
    { key: 'omschrijvingNl', label: t('kunstwerkenColOmschrijving') },
  ];

  return (
    <div data-testid="kunstwerken-section">
      <div className="mb-3 flex justify-end gap-2">
        {kunstwerkenZonderNaam.length > 0 && (
          <button
            type="button"
            onClick={handleBackfillNamen}
            disabled={backfillBezig}
            data-testid="kunstwerken-backfill-namen"
            className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {t('kunstwerkenBackfillNamen', { count: kunstwerkenZonderNaam.length })}
          </button>
        )}
        <button
          type="button"
          onClick={openAdd}
          data-testid="kunstwerken-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('kunstwerkenToevoegen')}
        </button>
      </div>
      <DataTable<KunstwerkRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('kunstwerkenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')} wide>
        <div
          data-testid="kunstwerk-modal"
          className="grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelFoto')}
            <span
              onDragOver={handleFotoDragOver}
              onDragLeave={handleFotoDragLeave}
              onDrop={handleFotoDrop}
              data-testid="kunstwerk-modal-foto-dropzone"
              className={`flex flex-col items-center gap-2 rounded-sm border border-dashed px-3 py-4 text-center transition-colors ${
                isDraggingFoto ? 'border-silver bg-white/10' : 'border-white/20'
              }`}
            >
              <span className="text-xs normal-case tracking-normal text-white/60">
                {t('kunstwerkenFotoDropHint')}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoChange}
                data-testid="kunstwerk-modal-foto-input"
                className="text-sm text-white"
              />
            </span>
          </label>
          {uploading && (
            <p data-testid="kunstwerk-modal-foto-uploading" className="text-xs text-white/60">
              {t('kunstwerkenFotoUploading')}
            </p>
          )}
          {fotoUploadError && (
            <p data-testid="kunstwerk-modal-foto-error" className="text-xs text-red-400">
              {t('kunstwerkenFotoUploadError')}
            </p>
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelNaam')}
            <input
              type="text"
              value={naam}
              onChange={(event) => setNaam(event.target.value)}
              data-testid="kunstwerk-modal-naam"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelKunstenaar')}
            <select
              value={kunstenaarId}
              onChange={(event) => setKunstenaarId(event.target.value)}
              data-testid="kunstwerk-modal-kunstenaar"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="">{t('kunstwerkenKunstenaarGeen')}</option>
              {(kunstenaars ?? []).map((kunstenaar) => (
                <option key={kunstenaar.id} value={kunstenaar.id}>
                  {kunstenaar.naam}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelFormaat')}
            </legend>
            <div className="flex gap-4">
              {(['vierkant', 'liggend', 'staand'] as const).map((optie) => (
                <label key={optie} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="kunstwerk-formaat"
                    checked={formaat === optie}
                    onChange={() => setFormaat(optie)}
                    data-testid={`kunstwerk-modal-formaat-${optie}`}
                  />
                  {t(`kunstwerkenFormaat_${optie}`)}
                </label>
              ))}
            </div>
            {formaat === null && (
              <span data-testid="kunstwerk-modal-formaat-hint" className="text-xs text-white/50">
                {t('kunstwerkenFormaatVerplicht')}
              </span>
            )}
          </fieldset>

          {foto && (
            <img
              src={foto}
              alt=""
              data-testid="kunstwerk-modal-foto-preview"
              className="h-24 w-24 rounded object-cover"
            />
          )}

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelSegmenten')}
            </legend>
            {(segmenten ?? []).map((segment) => (
              <label key={segment.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={segmentIds.includes(segment.id)}
                  onChange={() => setSegmentIds((current) => toggle(current, segment.id))}
                  data-testid={`kunstwerk-modal-segment-${segment.id}`}
                />
                {segment.omschrijving}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelMaterialen')}
            </legend>
            {(materialen ?? []).map((materiaal) => (
              <label key={materiaal.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={materiaalIds.includes(materiaal.id)}
                  onChange={() => setMateriaalIds((current) => toggle(current, materiaal.id))}
                  data-testid={`kunstwerk-modal-materiaal-${materiaal.id}`}
                />
                {materiaalLabel(materiaal)}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelMaten')}</legend>
            {(maten ?? []).map((maat) => {
              const incompatibel =
                formaat !== null && (formaat === 'vierkant' ? !isVierkanteMaat(maat) : isVierkanteMaat(maat));
              return (
                <label
                  key={maat.id}
                  className={`flex items-center gap-2 text-sm text-white/80 ${incompatibel ? 'opacity-40' : ''}`}
                >
                  <input
                    type="checkbox"
                    disabled={incompatibel}
                    checked={maatIds.includes(maat.id)}
                    onChange={() => setMaatIds((current) => toggle(current, maat.id))}
                    data-testid={`kunstwerk-modal-maat-${maat.id}`}
                  />
                  {`${maat.breedte}×${maat.hoogte} cm`}
                </label>
              );
            })}
          </fieldset>

          {materiaalIds.length > 0 && maatIds.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPrijzen')}</span>
              <table data-testid="kunstwerk-modal-prijzen" className="border-collapse text-sm text-white/80">
                <thead>
                  <tr>
                    <th className="border border-white/10 px-2 py-1"></th>
                    {(maten ?? [])
                      .filter((maat) => maatIds.includes(maat.id))
                      .map((maat) => (
                        <th key={maat.id} className="border border-white/10 px-2 py-1 text-xs font-semibold">
                          {`${maat.breedte}×${maat.hoogte}`}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {(materialen ?? [])
                    .filter((materiaal) => materiaalIds.includes(materiaal.id))
                    .map((materiaal) => (
                      <tr key={materiaal.id}>
                        <td className="border border-white/10 px-2 py-1 text-xs whitespace-nowrap">
                          {materiaalLabel(materiaal)}
                        </td>
                        {(maten ?? [])
                          .filter((maat) => maatIds.includes(maat.id))
                          .map((maat) => {
                            const key = prijsKey(materiaal.id, maat.id);
                            return (
                              <td key={maat.id} className="border border-white/10 px-2 py-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-white/50">€</span>
                                  <input
                                    type="number"
                                    value={prijzen[key] ?? ''}
                                    onChange={(event) =>
                                      setPrijzen((current) => ({ ...current, [key]: event.target.value }))
                                    }
                                    data-testid={`kunstwerk-modal-prijs-${materiaal.id}-${maat.id}`}
                                    className="w-20 rounded-sm bg-black/40 px-2 py-1 text-sm text-white"
                                  />
                                </div>
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingNl')}
            <textarea
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-nl"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingFr')}
            <textarea
              value={omschrijvingFr}
              onChange={(event) => setOmschrijvingFr(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-fr"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingDe')}
            <textarea
              value={omschrijvingDe}
              onChange={(event) => setOmschrijvingDe(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-de"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelOmschrijvingEn')}
            <textarea
              value={omschrijvingEn}
              onChange={(event) => setOmschrijvingEn(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-en"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          {actionError && (
            <p data-testid="kunstwerk-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={opslaanDisabled}
              data-testid="kunstwerk-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('kunstwerkenOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="kunstwerk-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('kunstwerkenVerwijderen')}
              </button>
            )}
          </div>
          </div>

          <div className="lg:sticky lg:top-0 lg:pt-10">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPreview')}</span>
              <KunstwerkSpecCard
                fotoSlot={
                  foto ? (
                    <img src={foto} alt={naam} data-testid="kunstwerk-spec-card-foto" className="h-full w-full object-contain" />
                  ) : undefined
                }
                code={naam}
                titel={omschrijvingNl}
                artiest={kunstenaarNaamById.get(kunstenaarId) ?? ''}
                collectieLabels={segmentIds.map((segmentId) => segmentNaamById.get(segmentId) ?? segmentId)}
                materiaalLabels={(materialen ?? [])
                  .filter((materiaal) => materiaalIds.includes(materiaal.id))
                  .map(materiaalLabel)}
                maatLabels={(maten ?? [])
                  .filter((maat) => maatIds.includes(maat.id))
                  .map((maat) => `${maat.breedte}×${maat.hoogte} cm`)}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
