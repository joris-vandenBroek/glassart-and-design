'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, deleteDoc, doc, getDoc, setDoc, type DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { Combobox } from '@/components/Combobox';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Kunstenaar } from './kunstenaarTypes';
import type { Klant } from './KlantenSection';
import type { Kunstwerk } from './materiaalTypes';

interface KunstenaarsSectionProps {
  kunstenaars: Kunstenaar[] | null;
  klanten: Klant[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  onUpdate: (id: string, data: Partial<Omit<Kunstenaar, 'id'>>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onRefetch: () => Promise<boolean>;
}

// Interne prijsafspraken staan in een aparte, alleen voor medewerkers leesbare
// collectie; het kunstenaars-document zelf is publiek leesbaar (Collecties-pagina).
const AFSPRAKEN_COLLECTION = 'kunstenaarAfspraken';

// Documenten die vóór deze splitsing zijn aangemaakt hebben `prijsafspraken` nog in het
// publieke document staan; zie de toelichting bij KunstenaarUpdate in kunstenaarTypes.ts.
type LegacyKunstenaar = Kunstenaar & { prijsafspraken?: string };

type ModalState = { mode: 'add' } | { mode: 'edit'; kunstenaar: Kunstenaar } | null;
type KunstenaarRow = Kunstenaar & { verkooprechtLabel: string; klantNaam: string };

const LEGE_FORM = {
  foto: null as string | null,
  naam: '',
  omschrijvingNl: '',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
  prijsafspraken: '',
  verkooprecht: 'open' as Kunstenaar['verkooprecht'],
  klantId: null as string | null,
};

export function KunstenaarsSection({
  kunstenaars,
  klanten,
  kunstwerken,
  loadError,
  onUpdate,
  onRemove,
  onRefetch,
}: KunstenaarsSectionProps) {
  const t = useTranslations('beheer');
  const { uploading, error: fotoUploadError, upload } = useKunstwerkFotoUpload();
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [foto, setFoto] = useState<string | null>(LEGE_FORM.foto);
  const [naam, setNaam] = useState(LEGE_FORM.naam);
  const [omschrijvingNl, setOmschrijvingNl] = useState(LEGE_FORM.omschrijvingNl);
  const [omschrijvingFr, setOmschrijvingFr] = useState(LEGE_FORM.omschrijvingFr);
  const [omschrijvingDe, setOmschrijvingDe] = useState(LEGE_FORM.omschrijvingDe);
  const [omschrijvingEn, setOmschrijvingEn] = useState(LEGE_FORM.omschrijvingEn);
  const [prijsafspraken, setPrijsafspraken] = useState(LEGE_FORM.prijsafspraken);
  const [verkooprecht, setVerkooprecht] = useState<Kunstenaar['verkooprecht']>(LEGE_FORM.verkooprecht);
  const [klantId, setKlantId] = useState<string | null>(LEGE_FORM.klantId);
  const [prijsafsprakenLaden, setPrijsafsprakenLaden] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDraggingFoto, setIsDraggingFoto] = useState(false);
  // Id van de kunstenaar waarvoor de modal nú openstaat. Een trage getDoc van een
  // eerder geopende kunstenaar mag de afspraken van de huidige niet overschrijven.
  const geopendeKunstenaarIdRef = useRef<string | null>(null);
  // Eén keer gegenereerde doc-referentie per 'toevoegen'-sessie, zodat een tweede
  // poging na een mislukte opslag hetzelfde document overschrijft in plaats van een
  // duplicaat kunstenaar aan te maken.
  const nieuweKunstenaarRef = useRef<DocumentReference | null>(null);

  const klantNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (klanten ?? []).forEach((klant) => map.set(klant.id, klant.companyName));
    return map;
  }, [klanten]);

  if (loadError) {
    return (
      <p data-testid="kunstenaars-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (kunstenaars === null) {
    return null;
  }

  const rows: KunstenaarRow[] = kunstenaars.map((kunstenaar) => ({
    ...kunstenaar,
    verkooprechtLabel:
      kunstenaar.verkooprecht === 'open'
        ? t('kunstenaarsVerkooprechtOpen')
        : t('kunstenaarsVerkooprechtAlleenKunstenaar'),
    klantNaam: kunstenaar.klantId ? klantNaamById.get(kunstenaar.klantId) ?? kunstenaar.klantId : '',
  }));

  function resetForm() {
    setFoto(LEGE_FORM.foto);
    setNaam(LEGE_FORM.naam);
    setOmschrijvingNl(LEGE_FORM.omschrijvingNl);
    setOmschrijvingFr(LEGE_FORM.omschrijvingFr);
    setOmschrijvingDe(LEGE_FORM.omschrijvingDe);
    setOmschrijvingEn(LEGE_FORM.omschrijvingEn);
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setVerkooprecht(LEGE_FORM.verkooprecht);
    setKlantId(LEGE_FORM.klantId);
    setPrijsafsprakenLaden(false);
    setActionError(null);
  }

  function openAdd() {
    resetForm();
    geopendeKunstenaarIdRef.current = null;
    nieuweKunstenaarRef.current = null;
    setModalState({ mode: 'add' });
  }

  async function openEdit(kunstenaar: Kunstenaar) {
    setFoto(kunstenaar.foto);
    setNaam(kunstenaar.naam);
    setOmschrijvingNl(kunstenaar.omschrijvingNl);
    setOmschrijvingFr(kunstenaar.omschrijvingFr);
    setOmschrijvingDe(kunstenaar.omschrijvingDe);
    setOmschrijvingEn(kunstenaar.omschrijvingEn);
    setPrijsafspraken(LEGE_FORM.prijsafspraken);
    setVerkooprecht(kunstenaar.verkooprecht);
    setKlantId(kunstenaar.klantId);
    setActionError(null);
    // Opslaan blijft geblokkeerd tot de afspraken geladen zijn: naam en omschrijving
    // zijn al ingevuld, dus zonder deze vlag zou je kunnen opslaan vóórdat de fetch
    // klaar is en daarmee een lege afspraak wegschrijven.
    setPrijsafsprakenLaden(true);
    geopendeKunstenaarIdRef.current = kunstenaar.id;
    nieuweKunstenaarRef.current = null;
    setModalState({ mode: 'edit', kunstenaar });
    // Val terug op het legacy-veld in het publieke document, anders zouden de
    // afspraken van nog niet gemigreerde kunstenaars bij het eerste opslaan
    // gewist worden.
    const legacyPrijsafspraken = (kunstenaar as LegacyKunstenaar).prijsafspraken;
    try {
      const afsprakenSnap = await getDoc(doc(db, AFSPRAKEN_COLLECTION, kunstenaar.id));
      if (geopendeKunstenaarIdRef.current !== kunstenaar.id) return;
      setPrijsafspraken(
        (afsprakenSnap.data()?.prijsafspraken as string | undefined) ?? legacyPrijsafspraken ?? ''
      );
      setPrijsafsprakenLaden(false);
    } catch {
      if (geopendeKunstenaarIdRef.current !== kunstenaar.id) return;
      // Bewust géén terugval op '': een mislukte lees mag niet leiden tot het
      // overschrijven van een goede afspraak met een lege waarde. Opslaan blijft
      // geblokkeerd (prijsafsprakenLaden blijft true) tot de modal opnieuw wordt geopend.
      setActionError(t('kunstenaarsAfsprakenLoadError'));
    }
  }

  function closeModal() {
    geopendeKunstenaarIdRef.current = null;
    nieuweKunstenaarRef.current = null;
    setPrijsafsprakenLaden(false);
    setModalState(null);
  }

  async function handleFotoFile(file: File) {
    const url = await upload(file);
    if (url) {
      setFoto(url);
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

  const opslaanDisabled = !naam || !omschrijvingNl || uploading || prijsafsprakenLaden;

  async function handleSave() {
    if (!modalState) return;
    const data = {
      foto,
      naam,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      verkooprecht,
      klantId,
      exclusiefVoorKlantId: modalState.mode === 'edit' ? modalState.kunstenaar.exclusiefVoorKlantId : null,
    };
    let success: boolean;
    try {
      if (modalState.mode === 'add') {
        // De generieke add() geeft het nieuwe id niet terug, en dat id is nodig om
        // het bijbehorende afsprakendocument te kunnen schrijven. De referentie wordt
        // per modal-sessie één keer gegenereerd: een tweede poging na een fout
        // overschrijft hetzelfde document in plaats van een duplicaat te maken.
        nieuweKunstenaarRef.current ??= doc(collection(db, 'kunstenaars'));
        const nieuweRef = nieuweKunstenaarRef.current;
        await setDoc(nieuweRef, data);
        await setDoc(doc(db, AFSPRAKEN_COLLECTION, nieuweRef.id), { prijsafspraken });
        // Beide schrijfacties zijn geslaagd en dus duurzaam. Een mislukte refetch is
        // een leesprobleem (useFirestoreCollection zet zelf zijn load-error) en mag de
        // opslag niet als mislukt presenteren — dat zou tot een tweede poging leiden.
        await onRefetch();
        success = true;
      } else {
        // Eerst het afsprakendocument met de zojuist ingevoerde waarde, dán pas de update
        // van het publieke document. onUpdate is de veilige wrapper uit BeheerShell, die
        // een nog niet gemigreerde legacy-waarde migreert vóór hij hem stript; doordat het
        // afsprakendocument hier al bestaat, slaat die migratie de verse invoer niet over.
        await setDoc(doc(db, AFSPRAKEN_COLLECTION, modalState.kunstenaar.id), { prijsafspraken });
        success = await onUpdate(modalState.kunstenaar.id, data);
      }
    } catch {
      success = false;
    }
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstenaar_toegevoegd' : 'kunstenaar_gewijzigd',
        actorFromMedewerker(user)
      );
      closeModal();
    } else {
      setActionError(t('kunstenaarsActionError'));
    }
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    // Nog niet geladen kunstwerken mogen niet als "niet in gebruik" gelezen worden: dat
    // zou een kunstwerk met een dangling kunstenaarId achterlaten.
    if (kunstwerken === null) {
      setActionError(t('kunstenaarsVerwijderOnbekend'));
      return;
    }
    const inUse = kunstwerken.some((kunstwerk) => kunstwerk.kunstenaarId === modalState.kunstenaar.id);
    if (inUse) {
      setActionError(t('kunstenaarsVerwijderBlocked'));
      return;
    }
    let success: boolean;
    try {
      success = await onRemove(modalState.kunstenaar.id);
      if (success) {
        await deleteDoc(doc(db, AFSPRAKEN_COLLECTION, modalState.kunstenaar.id));
      }
    } catch {
      success = false;
    }
    if (success) {
      void logActiviteit('kunstenaar_verwijderd', actorFromMedewerker(user));
      closeModal();
    } else {
      setActionError(t('kunstenaarsActionError'));
    }
  }

  const columns: Column<KunstenaarRow>[] = [
    { key: 'naam', label: t('kunstenaarsColNaam') },
    { key: 'verkooprechtLabel', label: t('kunstenaarsColVerkooprecht') },
    { key: 'klantNaam', label: t('kunstenaarsColKlant') },
  ];

  return (
    <div data-testid="kunstenaars-section">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          data-testid="kunstenaars-add"
          className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
        >
          {t('kunstenaarsToevoegen')}
        </button>
      </div>
      <DataTable<KunstenaarRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => void openEdit(row)}
        emptyLabel={t('kunstenaarsEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <Modal isOpen={modalState !== null} onClose={closeModal} closeLabel={t('modalClose')}>
        <div data-testid="kunstenaar-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelFoto')}
            <span
              onDragOver={handleFotoDragOver}
              onDragLeave={handleFotoDragLeave}
              onDrop={handleFotoDrop}
              data-testid="kunstenaar-modal-foto-dropzone"
              className={`flex flex-col items-center gap-2 rounded-sm border border-dashed px-3 py-4 text-center transition-colors ${
                isDraggingFoto ? 'border-silver bg-white/10' : 'border-white/20'
              }`}
            >
              <span className="text-xs normal-case tracking-normal text-white/60">
                {t('kunstenaarsFotoDropHint')}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoChange}
                data-testid="kunstenaar-modal-foto-input"
                className="text-sm text-white"
              />
            </span>
          </label>
          {uploading && (
            <p data-testid="kunstenaar-modal-foto-uploading" className="text-xs text-white/60">
              {t('kunstenaarsFotoUploading')}
            </p>
          )}
          {fotoUploadError && (
            <p data-testid="kunstenaar-modal-foto-error" className="text-xs text-red-400">
              {t('kunstenaarsFotoUploadError')}
            </p>
          )}
          {foto && (
            <img
              src={foto}
              alt=""
              data-testid="kunstenaar-modal-foto-preview"
              className="h-24 w-24 rounded object-cover"
            />
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelNaam')}
            <input
              type="text"
              value={naam}
              onChange={(event) => setNaam(event.target.value)}
              data-testid="kunstenaar-modal-naam"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingNl')}
            <textarea
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-nl"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingFr')}
            <textarea
              value={omschrijvingFr}
              onChange={(event) => setOmschrijvingFr(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-fr"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingDe')}
            <textarea
              value={omschrijvingDe}
              onChange={(event) => setOmschrijvingDe(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-de"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelOmschrijvingEn')}
            <textarea
              value={omschrijvingEn}
              onChange={(event) => setOmschrijvingEn(event.target.value)}
              data-testid="kunstenaar-modal-omschrijving-en"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelPrijsafspraken')}
            <textarea
              value={prijsafspraken}
              onChange={(event) => setPrijsafspraken(event.target.value)}
              data-testid="kunstenaar-modal-prijsafspraken"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelVerkooprecht')}
            <select
              value={verkooprecht}
              onChange={(event) => setVerkooprecht(event.target.value as Kunstenaar['verkooprecht'])}
              data-testid="kunstenaar-modal-verkooprecht"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="open">{t('kunstenaarsVerkooprechtOpen')}</option>
              <option value="alleen-kunstenaar">{t('kunstenaarsVerkooprechtAlleenKunstenaar')}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstenaarsLabelKlant')}
            <Combobox
              options={(klanten ?? []).map((klant) => ({ value: klant.id, label: klant.companyName }))}
              value={klantId}
              onChange={setKlantId}
              placeholder={t('kunstenaarsKlantPlaceholder')}
              noResultsLabel={t('kunstenaarsKlantGeenResultaten')}
              clearLabel={t('kunstenaarsKlantGeen')}
              testId="kunstenaar-modal-klant"
            />
          </label>

          {actionError && (
            <p data-testid="kunstenaar-modal-error" className="text-xs text-red-400">
              {actionError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={opslaanDisabled}
              data-testid="kunstenaar-modal-opslaan"
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('kunstenaarsOpslaan')}
            </button>
            {modalState?.mode === 'edit' && (
              <button
                type="button"
                onClick={handleRemove}
                data-testid="kunstenaar-modal-verwijderen"
                className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('kunstenaarsVerwijderen')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
