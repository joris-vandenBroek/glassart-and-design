'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { HelpHint } from '@/components/HelpHint';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { ModalTabs } from '@/components/ModalTabs';
import { ProductModal } from '@/components/ProductModal';
import { useKunstwerkFotoUpload } from '@/lib/useKunstwerkFotoUpload';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import type { Kunstwerk, Segment, Materiaal, Materiaalsoort, Maat, KunstwerkFormaat, Stijl, Onderwerp } from './materiaalTypes';
import { isVierkanteMaat } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';
import { detectFormaatFromFile, detectFormaatFromImageUrl } from '@/lib/detectKunstwerkFormaat';
import { stelVolgendeCodeVoor, vindBekendePrefixen } from '@/lib/kunstwerkCodeVoorstel';

interface KunstwerkenSectionProps {
  kunstwerken: Kunstwerk[] | null;
  segmenten: Segment[] | null;
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  maten: Maat[] | null;
  stijlen: Stijl[] | null;
  onderwerpen: Onderwerp[] | null;
  kunstenaars: Kunstenaar[] | null;
  loadError: string | null;
  // De codes die in een bestelregel voorkomen. Leeg zolang de bestellingen nog laden --
  // dat venster is sub-seconde en de 409 uit /api/kunstwerken/[id] is de harde grens,
  // dus dit veld is een UX-hulp, geen beveiliging.
  bestelCodes: Set<string>;
  // De foutcode uit useApiCollection's lastMutationErrorCode voor de laatste mislukte
  // add/update/remove op deze resource (bijv. 'code-bestaat-al'). null zolang er geen
  // mislukte mutatie is geweest of de server geen herkenbare code teruggaf.
  actionErrorCode: string | null;
  onAdd: (data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Kunstwerk, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onAddSegment: (data: Omit<Segment, 'id'>) => Promise<boolean>;
  onAddStijl: (data: Omit<Stijl, 'id'>) => Promise<boolean>;
  onAddOnderwerp: (data: Omit<Onderwerp, 'id'>) => Promise<boolean>;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; kunstwerk: Kunstwerk } | null;
type TabId = 'algemeen' | 'kenmerken' | 'omschrijvingen';
type KunstwerkRow = Kunstwerk & { segmentNamen: string; kunstenaarNaam: string };

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

const LEGE_FORM = {
  foto: '',
  code: '',
  prefix: '',
  kunstenaarnr: '' as string,
  formaat: null as KunstwerkFormaat | null,
  segmentIds: [] as string[],
  materiaalIds: [] as string[],
  maatIds: [] as string[],
  stijlIds: [] as string[],
  onderwerpIds: [] as string[],
  aiGegenereerd: false,
  prijsPerM2: '',
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
  stijlen,
  onderwerpen,
  kunstenaars,
  loadError,
  bestelCodes,
  actionErrorCode,
  onAdd,
  onUpdate,
  onRemove,
  onAddSegment,
  onAddStijl,
  onAddOnderwerp,
}: KunstwerkenSectionProps) {
  const t = useTranslations('beheer');
  const { uploading, error: fotoUploadError, upload } = useKunstwerkFotoUpload();
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [foto, setFoto] = useState(LEGE_FORM.foto);
  const [code, setCode] = useState(LEGE_FORM.code);
  const [prefix, setPrefix] = useState(LEGE_FORM.prefix);
  const [kunstenaarnr, setKunstenaarnr] = useState(LEGE_FORM.kunstenaarnr);
  const [formaat, setFormaatState] = useState<KunstwerkFormaat | null>(LEGE_FORM.formaat);
  const [segmentIds, setSegmentIds] = useState<string[]>(LEGE_FORM.segmentIds);
  const [materiaalIds, setMateriaalIds] = useState<string[]>(LEGE_FORM.materiaalIds);
  const [maatIds, setMaatIds] = useState<string[]>(LEGE_FORM.maatIds);
  const [stijlIds, setStijlIds] = useState<string[]>(LEGE_FORM.stijlIds);
  const [onderwerpIds, setOnderwerpIds] = useState<string[]>(LEGE_FORM.onderwerpIds);
  const [aiGegenereerd, setAiGegenereerd] = useState<boolean>(LEGE_FORM.aiGegenereerd);
  const [nieuweSegmentNaam, setNieuweSegmentNaam] = useState('');
  const [pendingNieuweSegmentNaam, setPendingNieuweSegmentNaam] = useState<string | null>(null);
  const [segmentToevoegenError, setSegmentToevoegenError] = useState<string | null>(null);
  const [nieuweStijlNaam, setNieuweStijlNaam] = useState('');
  const [nieuweOnderwerpNaam, setNieuweOnderwerpNaam] = useState('');
  const [pendingNieuweStijlNaam, setPendingNieuweStijlNaam] = useState<string | null>(null);
  const [pendingNieuweOnderwerpNaam, setPendingNieuweOnderwerpNaam] = useState<string | null>(null);
  const [stijlToevoegenError, setStijlToevoegenError] = useState<string | null>(null);
  const [onderwerpToevoegenError, setOnderwerpToevoegenError] = useState<string | null>(null);
  const [prijsPerM2, setPrijsPerM2] = useState(LEGE_FORM.prijsPerM2);
  const [omschrijvingNl, setOmschrijvingNl] = useState(LEGE_FORM.omschrijvingNl);
  const [omschrijvingFr, setOmschrijvingFr] = useState(LEGE_FORM.omschrijvingFr);
  const [omschrijvingDe, setOmschrijvingDe] = useState(LEGE_FORM.omschrijvingDe);
  const [omschrijvingEn, setOmschrijvingEn] = useState(LEGE_FORM.omschrijvingEn);
  const [actionError, setActionError] = useState<string | null>(null);
  // Zet aan zodra een add/update/remove van de server false teruggeeft. De getoonde
  // tekst wordt bij elke render opnieuw berekend uit `actionErrorCode` (zie
  // mutatieFoutmelding hieronder) in plaats van eenmalig vastgelegd na de await --
  // `actionErrorCode` komt uit React-state een render later binnen dan de boolean uit
  // add/update/remove, dus een closure die hem meteen na de await zou lezen ving nog
  // de oude waarde. Herberekenen bij elke render lost dat op zonder op precieze
  // update-volgorde te hoeven vertrouwen.
  const [mutationFailed, setMutationFailed] = useState(false);
  const [isDraggingFoto, setIsDraggingFoto] = useState(false);
  const [backfillBezig, setBackfillBezig] = useState(false);
  const [pendingCodeWijziging, setPendingCodeWijziging] = useState<string | null>(null);
  const formaatSessionRef = useRef(0);

  const [activeTab, setActiveTab] = useState<TabId>('algemeen');

  useEffect(() => {
    if (!pendingNieuweSegmentNaam) return;
    const gevonden = (segmenten ?? []).find((segment) => segment.omschrijvingNl === pendingNieuweSegmentNaam);
    if (gevonden) {
      setSegmentIds((current) => (current.includes(gevonden.id) ? current : [...current, gevonden.id]));
      setPendingNieuweSegmentNaam(null);
      setNieuweSegmentNaam('');
    }
  }, [segmenten, pendingNieuweSegmentNaam]);

  useEffect(() => {
    if (!pendingNieuweStijlNaam) return;
    const gevonden = (stijlen ?? []).find((stijl) => stijl.omschrijvingNl === pendingNieuweStijlNaam);
    if (gevonden) {
      setStijlIds((current) => (current.includes(gevonden.id) ? current : [...current, gevonden.id]));
      setPendingNieuweStijlNaam(null);
      setNieuweStijlNaam('');
    }
  }, [stijlen, pendingNieuweStijlNaam]);

  useEffect(() => {
    if (!pendingNieuweOnderwerpNaam) return;
    const gevonden = (onderwerpen ?? []).find((onderwerp) => onderwerp.omschrijvingNl === pendingNieuweOnderwerpNaam);
    if (gevonden) {
      setOnderwerpIds((current) => (current.includes(gevonden.id) ? current : [...current, gevonden.id]));
      setPendingNieuweOnderwerpNaam(null);
      setNieuweOnderwerpNaam('');
    }
  }, [onderwerpen, pendingNieuweOnderwerpNaam]);

  async function handleAddNieuweSegment() {
    const naam = nieuweSegmentNaam.trim();
    if (!naam) return;
    setSegmentToevoegenError(null);
    const bestaande = (segmenten ?? []).find(
      (segment) => segment.omschrijvingNl.toLowerCase() === naam.toLowerCase()
    );
    if (bestaande) {
      setSegmentIds((current) => (current.includes(bestaande.id) ? current : [...current, bestaande.id]));
      setNieuweSegmentNaam('');
      return;
    }
    setPendingNieuweSegmentNaam(naam);
    const success = await onAddSegment({ omschrijvingNl: naam, omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' });
    if (success) {
      void logActiviteit('segment_toegevoegd', naam);
    } else {
      setPendingNieuweSegmentNaam(null);
      setSegmentToevoegenError(t('kunstwerkenNieuweSegmentError'));
    }
  }

  async function handleAddNieuweStijl() {
    const naam = nieuweStijlNaam.trim();
    if (!naam) return;
    setStijlToevoegenError(null);
    const bestaande = (stijlen ?? []).find((stijl) => stijl.omschrijvingNl.toLowerCase() === naam.toLowerCase());
    if (bestaande) {
      setStijlIds((current) => (current.includes(bestaande.id) ? current : [...current, bestaande.id]));
      setNieuweStijlNaam('');
      return;
    }
    setPendingNieuweStijlNaam(naam);
    const success = await onAddStijl({ omschrijvingNl: naam, omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' });
    if (success) {
      void logActiviteit('stijl_toegevoegd');
    } else {
      setPendingNieuweStijlNaam(null);
      setStijlToevoegenError(t('kunstwerkenNieuweStijlError'));
    }
  }

  async function handleAddNieuweOnderwerp() {
    const naam = nieuweOnderwerpNaam.trim();
    if (!naam) return;
    setOnderwerpToevoegenError(null);
    const bestaande = (onderwerpen ?? []).find(
      (onderwerp) => onderwerp.omschrijvingNl.toLowerCase() === naam.toLowerCase()
    );
    if (bestaande) {
      setOnderwerpIds((current) => (current.includes(bestaande.id) ? current : [...current, bestaande.id]));
      setNieuweOnderwerpNaam('');
      return;
    }
    setPendingNieuweOnderwerpNaam(naam);
    const success = await onAddOnderwerp({ omschrijvingNl: naam, omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' });
    if (success) {
      void logActiviteit('onderwerp_toegevoegd');
    } else {
      setPendingNieuweOnderwerpNaam(null);
      setOnderwerpToevoegenError(t('kunstwerkenNieuweOnderwerpError'));
    }
  }

  const segmentNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (segmenten ?? []).forEach((segment) => map.set(segment.id, segment.omschrijvingNl));
    return map;
  }, [segmenten]);

  const materiaalsoortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijvingNl));
    return map;
  }, [materiaalsoorten]);

  const kunstenaarNaamByNr = useMemo(() => {
    const map = new Map<string, string>();
    (kunstenaars ?? []).forEach((kunstenaar) => map.set(kunstenaar.kunstenaarnr, kunstenaar.naam));
    return map;
  }, [kunstenaars]);

  const bekendePrefixen = useMemo(() => vindBekendePrefixen(kunstwerken ?? []), [kunstwerken]);

  const isMateriaalloos = materiaalIds.length === 0;
  // Superset of isMateriaalloos: also true when a materiaal is chosen but every maat is
  // deliberately unchecked (e.g. "4mm veiligheidsglas, custom size, priced per m²").
  const isMaatloos = isMateriaalloos || maatIds.length === 0;

  const [previewPrijzen, setPreviewPrijzen] = useState<{ materiaalId: string; maatId: string; prijs: number }[]>([]);

  useEffect(() => {
    if (isMaatloos || materiaalIds.length === 0 || maatIds.length === 0) {
      setPreviewPrijzen([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      materiaalIds: materiaalIds.join(','),
      maatIds: maatIds.join(','),
      ...(kunstenaarnr ? { kunstenaarnr } : {}),
    });
    fetch(`/api/kunstwerken/prijzen?${params.toString()}`)
      .then((response) => {
        if (!response.ok) {
          // Falls back to an empty preview, same as a genuinely priceless combinatie --
          // logged here so a real fetch failure (e.g. session expired, server error) is at
          // least visible in the console instead of silently looking like "no prijs set".
          console.warn(`Kunstwerken-prijzen preview fetch failed with status ${response.status}`);
          return { prijzen: [] };
        }
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setPreviewPrijzen(body.prijzen ?? []);
      })
      .catch((err) => {
        console.warn('Kunstwerken-prijzen preview fetch threw', err);
        if (!cancelled) setPreviewPrijzen([]);
      });
    return () => {
      cancelled = true;
    };
  }, [materiaalIds, maatIds, kunstenaarnr, isMaatloos]);

  function buildKunstwerkData(): Omit<Kunstwerk, 'id'> {
    const basis = {
      foto,
      code: code.trim(),
      kunstenaarnr: kunstenaarnr || null,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds: isMaatloos ? [] : maatIds,
      stijlIds,
      onderwerpIds,
      aiGegenereerd,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
    };
    return isMaatloos ? { ...basis, prijsPerM2: Number(prijsPerM2) } : basis;
  }

  const previewKunstwerk: Kunstwerk = useMemo(
    () => ({
      id: modalState?.mode === 'edit' ? modalState.kunstwerk.id : 'nieuw-kunstwerk',
      ...buildKunstwerkData(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      foto,
      code,
      kunstenaarnr,
      formaat,
      segmentIds,
      materiaalIds,
      maatIds,
      stijlIds,
      onderwerpIds,
      aiGegenereerd,
      prijsPerM2,
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      modalState,
    ]
  );

  function materiaalLabel(materiaal: Materiaal): string {
    const soortNaam = materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId;
    return `${materiaal.materiaaldikte}mm — ${soortNaam}`;
  }

  // `preserveMaatloos`: when the admin explicitly picks a Formaat radio, every compatible maat
  // should always be (re-)selected — that's a deliberate, fresh choice. But formaat is also set
  // automatically in the background by photo auto-detection (handleFotoFile, and openEdit's
  // detection for legacy rows without a stored formaat); that's a suggestion, not an explicit
  // admin action, so it must not clobber a deliberately-empty maatIds the same way it must not
  // clobber a deliberately-empty materiaalIds below. Auto-detect call sites pass `true`.
  function setFormaat(optie: KunstwerkFormaat, preserveMaatloos = false) {
    setFormaatState(optie);
    setMaatIds((current) => {
      if (preserveMaatloos && current.length === 0) return current;
      return (maten ?? [])
        .filter((maat) => {
          if (optie === 'alle') return true;
          return optie === 'vierkant' ? isVierkanteMaat(maat) : !isVierkanteMaat(maat);
        })
        .map((maat) => maat.id);
    });
    // A kunstwerk with every materiaal unchecked is deliberately materiaalloos (priced per
    // m² instead), not "hasn't picked yet" — resetForm() always starts non-empty, so an
    // empty selection here only ever means the admin chose that. Leave it alone.
    setMateriaalIds((current) => (current.length === 0 ? current : (materialen ?? []).map((materiaal) => materiaal.id)));
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
    kunstenaarNaam: kunstwerk.kunstenaarnr ? kunstenaarNaamByNr.get(kunstwerk.kunstenaarnr) ?? '' : '',
  }));

  function resetForm() {
    setFoto(LEGE_FORM.foto);
    setCode(LEGE_FORM.code);
    setPrefix(LEGE_FORM.prefix);
    setKunstenaarnr(LEGE_FORM.kunstenaarnr);
    setFormaatState(LEGE_FORM.formaat);
    setSegmentIds(LEGE_FORM.segmentIds);
    setNieuweSegmentNaam('');
    setPendingNieuweSegmentNaam(null);
    setSegmentToevoegenError(null);
    setMateriaalIds((materialen ?? []).map((materiaal) => materiaal.id));
    setMaatIds((maten ?? []).map((maat) => maat.id));
    setStijlIds(LEGE_FORM.stijlIds);
    setOnderwerpIds(LEGE_FORM.onderwerpIds);
    setAiGegenereerd(LEGE_FORM.aiGegenereerd);
    setNieuweStijlNaam('');
    setNieuweOnderwerpNaam('');
    setPendingNieuweStijlNaam(null);
    setPendingNieuweOnderwerpNaam(null);
    setStijlToevoegenError(null);
    setOnderwerpToevoegenError(null);
    setPrijsPerM2(LEGE_FORM.prijsPerM2);
    setOmschrijvingNl(LEGE_FORM.omschrijvingNl);
    setOmschrijvingFr(LEGE_FORM.omschrijvingFr);
    setOmschrijvingDe(LEGE_FORM.omschrijvingDe);
    setOmschrijvingEn(LEGE_FORM.omschrijvingEn);
    setActionError(null);
    setMutationFailed(false);
    setPendingCodeWijziging(null);
  }

  function openAdd() {
    formaatSessionRef.current += 1;
    setActiveTab('algemeen');
    resetForm();
    setModalState({ mode: 'add' });
  }

  function openEdit(kunstwerk: Kunstwerk) {
    formaatSessionRef.current += 1;
    setActiveTab('algemeen');
    const session = formaatSessionRef.current;
    setFoto(kunstwerk.foto);
    setCode(kunstwerk.code ?? '');
    setKunstenaarnr(kunstwerk.kunstenaarnr ?? '');
    setSegmentIds(kunstwerk.segmentIds);
    setMateriaalIds(kunstwerk.materiaalIds);
    setMaatIds(kunstwerk.maatIds);
    setStijlIds(kunstwerk.stijlIds ?? []);
    setOnderwerpIds(kunstwerk.onderwerpIds ?? []);
    setAiGegenereerd(kunstwerk.aiGegenereerd ?? false);
    setPrijsPerM2(kunstwerk.prijsPerM2 != null ? String(kunstwerk.prijsPerM2) : '');
    setOmschrijvingNl(kunstwerk.omschrijvingNl);
    setOmschrijvingFr(kunstwerk.omschrijvingFr);
    setOmschrijvingDe(kunstwerk.omschrijvingDe);
    setOmschrijvingEn(kunstwerk.omschrijvingEn);
    setActionError(null);
    setMutationFailed(false);
    setPendingCodeWijziging(null);
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
          setFormaat(gedetecteerd, true);
        }
      });
    }
    setModalState({ mode: 'edit', kunstwerk });
  }

  function closeModal() {
    formaatSessionRef.current += 1;
    setPendingCodeWijziging(null);
    setMutationFailed(false);
    setModalState(null);
  }

  async function handleFotoFile(file: File) {
    const session = formaatSessionRef.current;
    const url = await upload(file);
    if (url) {
      setFoto(url);
      const gedetecteerd = await detectFormaatFromFile(file);
      if (gedetecteerd && formaatSessionRef.current === session) {
        setFormaat(gedetecteerd, true);
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

  const codeOpSlot = modalState?.mode === 'edit' && bestelCodes.has(modalState.kunstwerk.code);
  const algemeenHeeftFout = !foto || !code.trim() || formaat === null;
  const kenmerkenHeeftFout =
    segmentIds.length === 0 || (isMaatloos && (!prijsPerM2 || Number(prijsPerM2) <= 0));
  const omschrijvingenHeeftFout = !omschrijvingNl;
  const opslaanDisabled =
    !foto ||
    formaat === null ||
    uploading ||
    !code.trim() ||
    segmentIds.length === 0 ||
    (isMaatloos && (!prijsPerM2 || Number(prijsPerM2) <= 0)) ||
    !omschrijvingNl;

  async function bewaarKunstwerk() {
    if (!modalState) return;
    setMutationFailed(false);
    const data = buildKunstwerkData();
    const success = modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.kunstwerk.id, data);
    if (success) {
      void logActiviteit(
        modalState.mode === 'add' ? 'kunstwerk_toegevoegd' : 'kunstwerk_gewijzigd',
        code.trim()
      );
      closeModal();
    } else {
      setPendingCodeWijziging(null);
      setActionError(null);
      setMutationFailed(true);
    }
  }

  async function handleSave() {
    if (!modalState) return;
    const schoneCode = code.trim();

    // Dezelfde hoofdletterongevoelige vergelijking als de UNIQUE-index op de kolom,
    // voor ASCII-codes -- bij accenten vouwt utf8mb4_general_ci meer samen dan deze
    // JS-vergelijking (bv. "Café" en "Cafe" zijn voor MySQL gelijk, hier niet). Dit is
    // de nette melding; bij dat verschil valt de 409 uit /api/kunstwerken terug als
    // harde grens, en toont het scherm de generieke kunstwerkenActionError.
    const dubbel = (kunstwerken ?? []).some(
      (bestaand) =>
        bestaand.id !== (modalState.mode === 'edit' ? modalState.kunstwerk.id : '') &&
        bestaand.code.trim().toLowerCase() === schoneCode.toLowerCase()
    );
    if (dubbel) {
      setActionError(t('kunstwerkenCodeBestaatAl'));
      return;
    }

    // Exacte vergelijking: ook een wijziging van alleen de schrijfwijze is een
    // codewijziging, want de code belandt zo in bestellines en mogelijk in een
    // masterbestand buiten dit systeem.
    if (modalState.mode === 'edit' && schoneCode !== modalState.kunstwerk.code) {
      setActionError(null);
      setPendingCodeWijziging(schoneCode);
      return;
    }

    await bewaarKunstwerk();
  }

  function handleAnnulerenCodeWijziging() {
    setPendingCodeWijziging(null);
  }

  async function handleRemove() {
    if (modalState?.mode !== 'edit') return;
    setMutationFailed(false);
    const success = await onRemove(modalState.kunstwerk.id);
    if (success) {
      void logActiviteit('kunstwerk_verwijderd', modalState.kunstwerk.code);
      closeModal();
    } else {
      setActionError(null);
      setMutationFailed(true);
    }
  }

  // Vertaalt de servercode van de laatste mislukte mutatie naar de bijpassende
  // beheertekst. Berekend bij elke render (niet eenmalig na de mutatie) zodat de
  // juiste tekst verschijnt zodra `actionErrorCode` binnenkomt, ook al gebeurt dat een
  // render later dan de boolean die add/update/remove teruggeven.
  function mutatieFoutmelding(): string {
    if (actionErrorCode === 'code-bestaat-al') return t('kunstwerkenCodeBestaatAl');
    if (actionErrorCode === 'code-in-bestelling' || actionErrorCode === 'in-use-bestelling') {
      return t('kunstwerkenCodeVast');
    }
    return t('kunstwerkenActionError');
  }

  const alleMateriaalIds = (materialen ?? []).map((materiaal) => materiaal.id);
  const alleMaatIds = (maten ?? []).map((maat) => maat.id);
  const kunstwerkenZonderAlleMaterialenMaten = kunstwerken.filter(
    (kunstwerk) =>
      kunstwerk.materiaalIds.length > 0 &&
      kunstwerk.maatIds.length > 0 &&
      (alleMateriaalIds.some((id) => !kunstwerk.materiaalIds.includes(id)) ||
        alleMaatIds.some((id) => !kunstwerk.maatIds.includes(id)))
  );

  async function handleBackfillMaterialenMaten() {
    setBackfillBezig(true);
    for (const kunstwerk of kunstwerkenZonderAlleMaterialenMaten) {
      const { id, ...data } = kunstwerk;
      const success = await onUpdate(id, { ...data, materiaalIds: alleMateriaalIds, maatIds: alleMaatIds });
      if (success) {
        void logActiviteit('kunstwerk_gewijzigd');
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
    { key: 'code', label: t('kunstwerkenColCode') },
    { key: 'kunstenaarNaam', label: t('kunstwerkenColKunstenaar') },
    { key: 'segmentNamen', label: t('kunstwerkenColSegmenten') },
    { key: 'omschrijvingNl', label: t('kunstwerkenColOmschrijving') },
  ];

  return (
    <div data-testid="kunstwerken-section">
      <div className="mb-3 flex justify-end gap-2">
        {kunstwerkenZonderAlleMaterialenMaten.length > 0 && (
          <button
            type="button"
            onClick={handleBackfillMaterialenMaten}
            disabled={backfillBezig}
            data-testid="kunstwerken-backfill-materialen-maten"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {t('kunstwerkenBackfillMaterialenMaten', { count: kunstwerkenZonderAlleMaterialenMaten.length })}
          </button>
        )}
        <button
          type="button"
          onClick={openAdd}
          data-testid="kunstwerken-add"
          className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
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
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={
          <span className="inline-flex items-center gap-2">
            {modalState?.mode === 'edit' ? t('kunstwerkenModalTitelBewerken') : t('kunstwerkenModalTitelToevoegen')}
            <HelpHint text={t('kunstwerkenHelp')} testId="kunstwerk-modal-help" />
          </span>
        }
        wide
        footerActions={
          pendingCodeWijziging !== null ? (
            <>
              <button
                type="button"
                onClick={bewaarKunstwerk}
                data-testid="kunstwerk-modal-code-bevestigen"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
              >
                {t('kunstwerkenCodeWijzigenBevestig')}
              </button>
              <button
                type="button"
                onClick={handleAnnulerenCodeWijziging}
                data-testid="kunstwerk-modal-code-annuleren"
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
                disabled={opslaanDisabled}
                data-testid="kunstwerk-modal-opslaan"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('kunstwerkenOpslaan')}
              </button>
              {modalState?.mode === 'edit' && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={codeOpSlot}
                  title={codeOpSlot ? t('kunstwerkenCodeVast') : undefined}
                  data-testid="kunstwerk-modal-verwijderen"
                  className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
                >
                  {t('kunstwerkenVerwijderen')}
                </button>
              )}
            </>
          )
        }
      >
        <>
          {pendingCodeWijziging !== null && (
            <div
              data-testid="kunstwerk-modal-code-bevestiging"
              className="flex flex-col gap-3 text-sm text-white/80"
            >
              <p className="font-semibold text-white">{t('kunstwerkenCodeWijzigenTitel')}</p>
              <p>{t('kunstwerkenCodeWijzigenTekst')}</p>
            </div>
          )}
          <div
            data-testid="kunstwerk-modal"
            className={
              pendingCodeWijziging !== null
                ? 'hidden'
                : 'grid grid-cols-1 gap-6 text-sm text-white/80 lg:grid-cols-[minmax(0,1fr)_320px] min-[1432px]:grid-cols-[minmax(0,1fr)_560px]'
            }
        >
          <div className="sticky top-0 z-10 col-span-full bg-charcoal pb-2">
            <ModalTabs
              tabs={[
                { id: 'algemeen', label: t('kunstwerkenTabAlgemeen'), hasError: algemeenHeeftFout },
                { id: 'kenmerken', label: t('kunstwerkenTabKenmerken'), hasError: kenmerkenHeeftFout },
                { id: 'omschrijvingen', label: t('kunstwerkenTabOmschrijvingen'), hasError: omschrijvingenHeeftFout },
              ]}
              activeTabId={activeTab}
              onTabChange={setActiveTab}
              testIdPrefix="kunstwerk-modal"
            />
          </div>
          <div className="flex flex-col gap-3">
              <div className={activeTab === 'algemeen' ? 'flex flex-col gap-3' : 'hidden'}>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('kunstwerkenLabelFoto')}
              <RequiredMark />
            </span>
            <span
              onDragOver={handleFotoDragOver}
              onDragLeave={handleFotoDragLeave}
              onDrop={handleFotoDrop}
              data-testid="kunstwerk-modal-foto-dropzone"
              className={`flex flex-col items-center gap-2 rounded-sm border border-dashed px-3 py-4 text-center transition-colors ${
                isDraggingFoto ? 'border-silver bg-white/10' : foto ? 'border-white/20' : 'border-red-500/70'
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
          {!foto && (
            <p data-testid="kunstwerk-modal-foto-hint" className="text-xs text-red-400">
              {t('kunstwerkenFotoVerplicht')}
            </p>
          )}
          {uploading && (
            <p data-testid="kunstwerk-modal-foto-uploading" className="text-xs text-white/60">
              {t('kunstwerkenFotoUploading')}
            </p>
          )}
          {fotoUploadError && (
            <p data-testid="kunstwerk-modal-foto-error" className="text-xs text-red-400">
              {t(fotoUploadError === 'too-large' ? 'kunstwerkenFotoTooLarge' : 'kunstwerkenFotoUploadError')}
            </p>
          )}

          {modalState?.mode === 'add' && (
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              <span>{t('kunstwerkenLabelPrefix')}</span>
              <input
                type="text"
                list="kunstwerk-modal-prefixen"
                value={prefix}
                onChange={(event) => {
                  const waarde = event.target.value;
                  setPrefix(waarde);
                  if (waarde.trim()) {
                    setCode(stelVolgendeCodeVoor(kunstwerken ?? [], waarde));
                  }
                }}
                data-testid="kunstwerk-modal-prefix"
                className="rounded-sm border border-transparent bg-black/40 px-3 py-2 text-sm text-white"
              />
              <datalist id="kunstwerk-modal-prefixen">
                {bekendePrefixen.map((optie) => (
                  <option key={optie} value={optie} />
                ))}
              </datalist>
            </label>
          )}

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('kunstwerkenLabelCode')}
              <RequiredMark />
            </span>
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={codeOpSlot}
              data-testid="kunstwerk-modal-code"
              className={`rounded-sm border bg-black/40 px-3 py-2 text-sm text-white disabled:opacity-60 ${
                code.trim() ? 'border-transparent' : 'border-red-500/70'
              }`}
            />
            {codeOpSlot && (
              <span data-testid="kunstwerk-modal-code-vast" className="normal-case tracking-normal text-white/60">
                {t('kunstwerkenCodeVast')}
              </span>
            )}
            {!code.trim() && !codeOpSlot && (
              <span data-testid="kunstwerk-modal-code-hint" className="normal-case tracking-normal text-red-400">
                {t('kunstwerkenCodeVerplicht')}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('kunstwerkenLabelKunstenaar')}
            <select
              value={kunstenaarnr}
              onChange={(event) => setKunstenaarnr(event.target.value)}
              data-testid="kunstwerk-modal-kunstenaar"
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="">{t('kunstwerkenKunstenaarGeen')}</option>
              {(kunstenaars ?? []).map((kunstenaar) => (
                <option key={kunstenaar.id} value={kunstenaar.kunstenaarnr}>
                  {kunstenaar.naam}
                </option>
              ))}
            </select>
          </label>

          <fieldset
            className={`flex flex-col gap-1 rounded-sm border px-2 py-1.5 ${
              formaat === null ? 'border-red-500/70' : 'border-transparent'
            }`}
          >
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelFormaat')}
              <RequiredMark />
            </legend>
            <div className="flex gap-4">
              {(['vierkant', 'liggend', 'staand', 'alle'] as const).map((optie) => (
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
              <span data-testid="kunstwerk-modal-formaat-hint" className="text-xs text-red-400">
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
              </div>

              <div className={activeTab === 'kenmerken' ? 'flex flex-col gap-3' : 'hidden'}>
          <fieldset
            className={`flex flex-col gap-1 rounded-sm border px-2 py-1.5 ${
              segmentIds.length === 0 ? 'border-red-500/70' : 'border-transparent'
            }`}
          >
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelSegmenten')}
              <RequiredMark />
            </legend>
            {(segmenten ?? []).map((segment) => (
              <label key={segment.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={segmentIds.includes(segment.id)}
                  onChange={() => setSegmentIds((current) => toggle(current, segment.id))}
                  data-testid={`kunstwerk-modal-segment-${segment.id}`}
                />
                {segment.omschrijvingNl}
              </label>
            ))}
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={nieuweSegmentNaam}
                onChange={(event) => setNieuweSegmentNaam(event.target.value)}
                placeholder={t('kunstwerkenNieuweSegmentPlaceholder')}
                data-testid="kunstwerk-modal-nieuwe-segment-naam"
                className="flex-1 rounded-sm bg-black/40 px-3 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAddNieuweSegment}
                disabled={!nieuweSegmentNaam.trim()}
                data-testid="kunstwerk-modal-nieuwe-segment-toevoegen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
              >
                {t('kunstwerkenNieuweSegmentToevoegen')}
              </button>
            </div>
            {segmentToevoegenError && (
              <span data-testid="kunstwerk-modal-nieuwe-segment-error" className="text-xs text-red-400">
                {segmentToevoegenError}
              </span>
            )}
            {segmentIds.length === 0 && (
              <span data-testid="kunstwerk-modal-segmenten-hint" className="text-xs text-red-400">
                {t('kunstwerkenSegmentenVerplicht')}
              </span>
            )}
          </fieldset>

          <details className="flex flex-col gap-3 rounded-sm border border-white/10 px-3 py-2">
            <summary
              data-testid="kunstwerk-modal-materialen-maten-toggle"
              className="cursor-pointer text-xs uppercase tracking-wide text-white/60"
            >
              {t('kunstwerkenLabelMaterialenMaten')}
            </summary>
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
                  formaat !== null &&
                  formaat !== 'alle' &&
                  (formaat === 'vierkant' ? !isVierkanteMaat(maat) : isVierkanteMaat(maat));
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
          </details>

          {isMaatloos && (
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
              <span>
                {t('kunstwerkenLabelPrijsPerM2')}
                <RequiredMark />
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-white/50">€</span>
                <input
                  type="number"
                  value={prijsPerM2}
                  onChange={(event) => setPrijsPerM2(event.target.value)}
                  data-testid="kunstwerk-modal-prijs-per-m2"
                  className={`w-24 rounded-sm border bg-black/40 px-2 py-1 text-sm text-white ${
                    !prijsPerM2 || Number(prijsPerM2) <= 0 ? 'border-red-500/70' : 'border-transparent'
                  }`}
                />
              </div>
              {(!prijsPerM2 || Number(prijsPerM2) <= 0) && (
                <span data-testid="kunstwerk-modal-prijs-per-m2-hint" className="normal-case tracking-normal text-red-400">
                  {t('kunstwerkenPrijsPerM2Verplicht')}
                </span>
              )}
            </label>
          )}

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelStijlen')}
            </legend>
            {(stijlen ?? []).map((stijl) => (
              <label key={stijl.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={stijlIds.includes(stijl.id)}
                  onChange={() => setStijlIds((current) => toggle(current, stijl.id))}
                  data-testid={`kunstwerk-modal-stijl-${stijl.id}`}
                />
                {stijl.omschrijvingNl}
              </label>
            ))}
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={nieuweStijlNaam}
                onChange={(event) => setNieuweStijlNaam(event.target.value)}
                placeholder={t('kunstwerkenNieuweStijlPlaceholder')}
                data-testid="kunstwerk-modal-nieuwe-stijl-naam"
                className="flex-1 rounded-sm bg-black/40 px-3 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAddNieuweStijl}
                disabled={!nieuweStijlNaam.trim()}
                data-testid="kunstwerk-modal-nieuwe-stijl-toevoegen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
              >
                {t('kunstwerkenNieuweStijlToevoegen')}
              </button>
            </div>
            {stijlToevoegenError && (
              <span data-testid="kunstwerk-modal-nieuwe-stijl-error" className="text-xs text-red-400">
                {stijlToevoegenError}
              </span>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs uppercase tracking-wide text-white/60">
              {t('kunstwerkenLabelOnderwerpen')}
            </legend>
            {(onderwerpen ?? []).map((onderwerp) => (
              <label key={onderwerp.id} className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={onderwerpIds.includes(onderwerp.id)}
                  onChange={() => setOnderwerpIds((current) => toggle(current, onderwerp.id))}
                  data-testid={`kunstwerk-modal-onderwerp-${onderwerp.id}`}
                />
                {onderwerp.omschrijvingNl}
              </label>
            ))}
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={nieuweOnderwerpNaam}
                onChange={(event) => setNieuweOnderwerpNaam(event.target.value)}
                placeholder={t('kunstwerkenNieuweOnderwerpPlaceholder')}
                data-testid="kunstwerk-modal-nieuwe-onderwerp-naam"
                className="flex-1 rounded-sm bg-black/40 px-3 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                onClick={handleAddNieuweOnderwerp}
                disabled={!nieuweOnderwerpNaam.trim()}
                data-testid="kunstwerk-modal-nieuwe-onderwerp-toevoegen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
              >
                {t('kunstwerkenNieuweOnderwerpToevoegen')}
              </button>
            </div>
            {onderwerpToevoegenError && (
              <span data-testid="kunstwerk-modal-nieuwe-onderwerp-error" className="text-xs text-red-400">
                {onderwerpToevoegenError}
              </span>
            )}
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={aiGegenereerd}
              onChange={(event) => setAiGegenereerd(event.target.checked)}
              data-testid="kunstwerk-modal-ai-gegenereerd"
            />
            {t('kunstwerkenLabelAiGegenereerd')}
          </label>
              </div>

              <div className={activeTab === 'omschrijvingen' ? 'flex flex-col gap-3' : 'hidden'}>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            <span>
              {t('kunstwerkenLabelOmschrijvingNl')}
              <RequiredMark />
            </span>
            <textarea
              value={omschrijvingNl}
              onChange={(event) => setOmschrijvingNl(event.target.value)}
              data-testid="kunstwerk-modal-omschrijving-nl"
              className={`rounded-sm border bg-black/40 px-3 py-2 text-sm text-white ${
                omschrijvingNl ? 'border-transparent' : 'border-red-500/70'
              }`}
            />
            {!omschrijvingNl && (
              <span data-testid="kunstwerk-modal-omschrijving-nl-hint" className="normal-case tracking-normal text-red-400">
                {t('kunstwerkenOmschrijvingNlVerplicht')}
              </span>
            )}
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
              </div>

              <RequiredLegend testId="kunstwerk-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

              {(actionError || mutationFailed) && (
                <p data-testid="kunstwerk-modal-error" className="text-xs text-red-400">
                  {actionError ?? mutatieFoutmelding()}
                </p>
              )}
            </div>

          <div className="lg:sticky lg:top-0 lg:pt-10">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-white/60">{t('kunstwerkenLabelPreview')}</span>
              <ProductModal
                variant="preview"
                kunstwerk={previewKunstwerk}
                prijzen={previewPrijzen}
                materialen={materialen}
                maten={maten}
                materiaalsoorten={materiaalsoorten}
                kunstenaars={kunstenaars}
                segmenten={segmenten}
                stijlen={stijlen}
                onderwerpen={onderwerpen}
                onClose={() => {}}
              />
            </div>
          </div>
        </div>
        </>
      </Modal>
    </div>
  );
}
