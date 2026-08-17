'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { HelpLink } from '@/components/HelpLink';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import { isMateriaalActief, type Materiaal, type Materiaalsoort, type Kunstwerk } from './materiaalTypes';

interface MaterialenSectionProps {
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstwerken: Kunstwerk[] | null;
  loadError: string | null;
  // De foutcode uit useApiCollection's lastMutationErrorCode, zodat een geblokkeerde
  // deactivering een eigen melding krijgt in plaats van de generieke actiefout.
  actionErrorCode: string | null;
  onAdd: (data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onUpdate: (id: string, data: Omit<Materiaal, 'id'>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  // Na het bulk-koppelen kloppen de materiaalIds van elk kunstwerk niet meer.
  onKunstwerkenChanged: () => void;
}

type ModalState = { mode: 'add' } | { mode: 'edit'; materiaal: Materiaal } | null;
type MateriaalRow = Materiaal & { materiaalsoortNaam: string };

export function MaterialenSection({
  materialen,
  materiaalsoorten,
  kunstwerken,
  loadError,
  actionErrorCode,
  onAdd,
  onUpdate,
  onRemove,
  onKunstwerkenChanged,
}: MaterialenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [modalState, setModalState] = useState<ModalState>(null);
  const [materiaalsoortId, setMateriaalsoortId] = useState('');
  const [materiaaldikte, setMateriaaldikte] = useState('');
  const [prijsPerM2, setPrijsPerM2] = useState('');
  const [omschrijvingNl, setOmschrijvingNl] = useState('');
  const [omschrijvingFr, setOmschrijvingFr] = useState('');
  const [omschrijvingDe, setOmschrijvingDe] = useState('');
  const [omschrijvingEn, setOmschrijvingEn] = useState('');
  const [actief, setActief] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  // Zet aan zodra een add/update van de server false teruggeeft. De getoonde tekst wordt
  // bij elke render opnieuw berekend uit `actionErrorCode` (zie mutatieFoutmelding) in
  // plaats van eenmalig na de await: `actionErrorCode` komt uit React-state een render
  // later binnen dan de boolean uit add/update, dus een closure die hem meteen na de
  // await leest, ving nog de oude waarde. Zelfde patroon als KunstwerkenSection.
  const [mutationFailed, setMutationFailed] = useState(false);
  const [activerenVoorId, setActiverenVoorId] = useState<string | null>(null);
  const [koppelFout, setKoppelFout] = useState<string | null>(null);
  const [koppelBezig, setKoppelBezig] = useState(false);
  // Een net toegevoegd materiaal heeft nog geen id in dit component: onAdd geeft alleen
  // slagen/falen terug. We onthouden de ids die er vlak vóór het toevoegen al waren en
  // pakken het id op zodra useApiCollection de lijst heeft ververst. Herkennen op soort +
  // dikte + omschrijving kan niet: `materialen` heeft geen unieke index, dus een duplicaat
  // met exact dezelfde velden zou de eerste (oude) rij opleveren -- en dan zou de bulk-
  // koppeling over de hele catalogus op het verkeerde materiaal landen.
  const [nieuwActiefMateriaal, setNieuwActiefMateriaal] = useState<{
    bestaandeIds: string[];
    materiaalsoortId: string;
    materiaaldikte: number;
    omschrijvingNl: string;
  } | null>(null);

  const soortNameById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijvingNl));
    return map;
  }, [materiaalsoorten]);

  // Boven de vroege returns, anders draait de hook niet op elke render.
  useEffect(() => {
    if (!nieuwActiefMateriaal || !materialen) return;
    // Alleen ids die er vóór het toevoegen nog niet waren komen in aanmerking; de velden
    // dienen daarbinnen nog als controle, zodat een materiaal dat intussen door iemand
    // anders is aangemaakt niet per ongeluk gekozen wordt.
    const gevonden = materialen.find(
      (materiaal) =>
        !nieuwActiefMateriaal.bestaandeIds.includes(materiaal.id) &&
        materiaal.omschrijvingNl === nieuwActiefMateriaal.omschrijvingNl &&
        materiaal.materiaalsoortId === nieuwActiefMateriaal.materiaalsoortId &&
        Number(materiaal.materiaaldikte) === nieuwActiefMateriaal.materiaaldikte
    );
    if (gevonden) {
      setActiverenVoorId(gevonden.id);
      setKoppelFout(null);
      setNieuwActiefMateriaal(null);
    }
  }, [materialen, nieuwActiefMateriaal]);

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
    setPrijsPerM2('');
    setOmschrijvingNl('');
    setOmschrijvingFr('');
    setOmschrijvingDe('');
    setOmschrijvingEn('');
    setActief(true);
    setActionError(null);
    setMutationFailed(false);
    setModalState({ mode: 'add' });
  }

  function openEdit(materiaal: Materiaal) {
    setMateriaalsoortId(materiaal.materiaalsoortId);
    setMateriaaldikte(String(materiaal.materiaaldikte));
    setPrijsPerM2(materiaal.prijsPerM2 != null ? String(materiaal.prijsPerM2) : '');
    setOmschrijvingNl(materiaal.omschrijvingNl ?? '');
    setOmschrijvingFr(materiaal.omschrijvingFr ?? '');
    setOmschrijvingDe(materiaal.omschrijvingDe ?? '');
    setOmschrijvingEn(materiaal.omschrijvingEn ?? '');
    setActief(isMateriaalActief(materiaal));
    setActionError(null);
    setMutationFailed(false);
    setModalState({ mode: 'edit', materiaal });
  }

  function closeModal() {
    setModalState(null);
  }

  async function handleSave() {
    if (!modalState) return;
    // Vastleggen vóór de await: daarna is de lijst mogelijk al ververst met het nieuwe
    // materiaal erin, en dan is het verschil niet meer te zien.
    const bestaandeIds = (materialen ?? []).map((materiaal) => materiaal.id);
    // Een nieuw materiaal telt als "was uit": ook daar is de vraag zinnig, want het is
    // nog aan geen enkel kunstwerk gekoppeld.
    const wasActief = modalState.mode === 'edit' ? isMateriaalActief(modalState.materiaal) : false;
    const data = {
      materiaalsoortId,
      materiaaldikte: Number(materiaaldikte),
      prijsPerM2: Number(prijsPerM2),
      omschrijvingNl,
      omschrijvingFr,
      omschrijvingDe,
      omschrijvingEn,
      actief,
    };
    const geslaagd =
      modalState.mode === 'add' ? await onAdd(data) : await onUpdate(modalState.materiaal.id, data);
    if (!geslaagd) {
      setActionError(null);
      setMutationFailed(true);
      return;
    }
    void logActiviteit(
      modalState.mode === 'add' ? 'materiaal_toegevoegd' : 'materiaal_gewijzigd',
      omschrijvingNl
    );
    const wordtGeactiveerd = actief && !wasActief;
    const bewerktId = modalState.mode === 'edit' ? modalState.materiaal.id : null;
    closeModal();
    if (!wordtGeactiveerd) return;
    setKoppelFout(null);
    if (bewerktId) {
      setActiverenVoorId(bewerktId);
    } else {
      // Het id volgt zodra de lijst ververst is; zie het useEffect hierboven.
      setNieuwActiefMateriaal({
        bestaandeIds,
        materiaalsoortId,
        materiaaldikte: Number(materiaaldikte),
        omschrijvingNl,
      });
    }
  }

  function sluitActiverenDialoog() {
    setActiverenVoorId(null);
    setKoppelFout(null);
  }

  async function koppelAlleKunstwerken() {
    if (!activerenVoorId || koppelBezig) return;
    setKoppelBezig(true);
    setKoppelFout(null);
    try {
      const response = await fetch(`/api/materialen/${activerenVoorId}/koppel-kunstwerken`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('koppelen mislukt');
      sluitActiverenDialoog();
      onKunstwerkenChanged();
    } catch {
      // De dialoog blijft open met de fout erin: dit is een schrijfactie over de hele
      // catalogus, dus stil falen is geen optie. De actiefout van de materiaalmodal kan
      // hier niet gebruikt worden -- die modal is op dit moment al gesloten.
      setKoppelFout(t('materialenKoppelenFout'));
    } finally {
      setKoppelBezig(false);
    }
  }

  // Vertaalt de servercode van de laatste mislukte mutatie naar de bijpassende
  // beheertekst. Berekend bij elke render (niet eenmalig na de mutatie) zodat de juiste
  // tekst verschijnt zodra `actionErrorCode` binnenkomt.
  function mutatieFoutmelding(): string {
    if (actionErrorCode === 'in-use-open-bestelling') return t('materialenDeactiverenGeblokkeerd');
    return t('materialenActionError');
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
    { key: 'actief', label: t('materialenColActief'), render: (row) => (isMateriaalActief(row) ? 'Ja' : 'Nee') },
  ];

  return (
    <div data-testid="materialen-section">
      <DataTable<MateriaalRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowClick={openEdit}
        emptyLabel={t('materialenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
        headerAction={
          <button
            type="button"
            onClick={openAdd}
            data-testid="materialen-add"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
          >
            {t('materialenToevoegen')}
          </button>
        }
      />
      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        closeLabel={t('modalClose')}
        title={
          <span className="flex w-full items-center justify-between gap-2 pr-2">
            {t('materialenModalTitel')}
            <HelpLink
              anchor="stamgegevens-materialen"
              label="Open het hoofdstuk over materialen"
              testId="materiaal-modal-help"
            />
          </span>
        }
        footerActions={
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={!materiaalsoortId || materiaaldikte === '' || !prijsPerM2 || Number(prijsPerM2) <= 0 || !omschrijvingNl}
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
              {t('materialenLabelPrijsPerM2')}
              <RequiredMark />
            </span>
            <input
              type="number"
              value={prijsPerM2}
              onChange={(event) => setPrijsPerM2(event.target.value)}
              data-testid="materiaal-modal-prijs-per-m2"
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

          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
            <input
              type="checkbox"
              checked={actief}
              onChange={(event) => setActief(event.target.checked)}
              data-testid="materiaal-modal-actief"
            />
            {t('materialenLabelActief')}
          </label>

          <RequiredLegend testId="materiaal-modal-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

          {(actionError !== null || mutationFailed) && (
            <p data-testid="materiaal-modal-error" className="text-xs text-red-400">
              {actionError ?? mutatieFoutmelding()}
            </p>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={activerenVoorId !== null}
        onClose={sluitActiverenDialoog}
        closeLabel={t('modalClose')}
        title={t('materialenActiverenTitel')}
        footerActions={
          <>
            <button
              type="button"
              onClick={koppelAlleKunstwerken}
              disabled={koppelBezig}
              data-testid="materialen-activeren-alle"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('materialenActiverenAlleKunstwerken')}
            </button>
            <button
              type="button"
              onClick={sluitActiverenDialoog}
              data-testid="materialen-activeren-alleen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('materialenActiverenAlleenVlag')}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p data-testid="materialen-activeren-dialog" className="text-sm text-white/80">
            {t('materialenActiverenVraag')}
          </p>
          {koppelFout && (
            <p data-testid="materialen-activeren-fout" className="text-xs text-red-400">
              {koppelFout}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
