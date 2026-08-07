'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, type Column } from '@/components/DataTable';
import { HelpHint } from '@/components/HelpHint';
import { BestellingModal } from './BestellingModal';
import { VersturenNaarDrukkerDialog } from './VersturenNaarDrukkerDialog';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Drukker } from './materiaalTypes';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { actorFromMedewerker } from '@/lib/logActiviteit';
import { afrondBestellingen } from '@/lib/afrondenBestellingen';
import { fetchZendingen, openstaandeZendingGenoten, type ZendingGenoten } from '@/lib/zendingGenoten';
import { AfrondenBevestigingDialog } from './AfrondenBevestigingDialog';

export interface BestellingLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}

export interface Bestelling {
  id: string;
  klantId: string;
  companyName: string;
  bestelnr: string;
  besteldatum: string;
  status: 'Te beoordelen' | 'Te versturen naar drukker' | 'Verstuurd naar drukker' | 'Afgerond' | 'Afgewezen';
  lineCount: number;
  totalQuantity: number;
  lines: BestellingLine[];
}

interface BestellingenSectionProps {
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  drukkers: Drukker[] | null;
  loadError: string | null;
  onBestellingUpdated: (bestelling: Bestelling) => void;
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
  onLineUpdated: (bestellingId: string, lineId: string, updates: Partial<BestellingLine>) => void;
}

export function BestellingenSection({
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  drukkers,
  loadError,
  onBestellingUpdated,
  onLinePrijsVastgesteld,
  onLineUpdated,
}: BestellingenSectionProps) {
  const t = useTranslations('beheer');
  const [selectedBestelling, setSelectedBestelling] = useState<Bestelling | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showVersturenDialog, setShowVersturenDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const { user } = useAdminAuth();
  const [afrondKandidaten, setAfrondKandidaten] = useState<Bestelling[]>([]);
  const [afrondGenoten, setAfrondGenoten] = useState<ZendingGenoten[]>([]);
  const [afrondFout, setAfrondFout] = useState<string | null>(null);
  const [afrondBezig, setAfrondBezig] = useState(false);
  // Echte mutex: startAfronden heeft drie ingangen (bulkknop, de losse
  // "Afronden"-knop in BestellingModal, en indirect de bevestigingsdialoog),
  // en afrondBezig alleen (React state) is daarvoor ontoereikend -- een
  // closure kan een verouderde waarde zien en React voert de update pas later
  // door. afrondBezig blijft wel bestaan om knoppen in de render uit te
  // schakelen; afrondBezigRef is de synchroon gelezen/gezette slotvariabele
  // die daadwerkelijk bepaalt of een nieuwe ronde mag starten.
  const afrondBezigRef = useRef(false);
  // Los van afrondBezigRef (die alleen de korte lookup-fase beschermt) moet
  // een al openstaande bevestigingsdialoog zelf ook een nieuwe ronde weigeren.
  // Zonder dit slot kan een medewerker, terwijl de dialoog nog op een keuze
  // wacht, via een andere ingang (bijvoorbeeld de losse "Afronden"-knop in
  // BestellingModal voor een heel andere bestelling) een tweede ronde starten
  // die -- als die zelf ook zendinggenoten heeft -- afrondKandidaten/
  // afrondGenoten overschrijft en de eerste, nog onbeantwoorde dialoog
  // stilzwijgend laat verdwijnen. Ook dit moet een ref zijn: de closure van
  // die tweede aanroep moet synchroon kunnen zien dat er al een dialoog open
  // staat, vóór er ooit een lookup wordt gestart.
  const afrondDialoogOpenRef = useRef(false);
  // Onthoudt of de lopende afrondronde is gestart vanuit de bulkselectie (de
  // knop onder de "verstuurd naar drukker"-selectiebalk) of via de losse
  // "Afronden"-knop in BestellingModal voor één bestelling. Alleen de eerste
  // hoort de selectie leeg te maken na afloop -- de losse modal-route rondt
  // een bestelling af die vaak helemaal niet in de huidige selectie zit, en
  // zou anders een bestaande selectie van drie aangevinkte bestellingen
  // zonder aanleiding wegvegen. Beide ingangen zetten deze ref altijd expliciet
  // vlak vóór ze startAfronden aanroepen, dus hij weerspiegelt steeds de
  // herkomst van de ronde die daadwerkelijk loopt.
  const afrondUitSelectieRef = useRef(false);

  // Een oude foutmelding hoort niet te blijven hangen als de medewerker van
  // filter wisselt -- die verwijst dan mogelijk niet eens meer naar bestellingen
  // die nog zichtbaar zijn.
  useEffect(() => {
    setAfrondFout(null);
  }, [statusFilter]);

  useEffect(() => {
    if (bestellingen === null) return;
    // Houdt alleen ids over die nog bestaan én nog de status van het actieve
    // filter hebben. Dit dekt in één keer drie gevallen af: een bestelling die
    // verdwijnt, een bestelling waarvan de status verandert (bijvoorbeeld nadat
    // hij is verstuurd of afgerond), en het wisselen van filter.
    const stillSelectable = new Set(
      bestellingen.filter((b) => b.status === statusFilter).map((b) => b.id)
    );
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => stillSelectable.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bestellingen, statusFilter]);

  function handleToggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAll(ids: string[]) {
    setSelectedIds((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      const next = new Set(current);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function handleLinePrijsVastgesteld(bestellingId: string, lineId: string, prijs: number) {
    onLinePrijsVastgesteld(bestellingId, lineId, prijs);
    setSelectedBestelling((current) =>
      current && current.id === bestellingId
        ? { ...current, lines: current.lines.map((line) => (line.id === lineId ? { ...line, prijs } : line)) }
        : current
    );
  }

  function handleLineUpdated(bestellingId: string, lineId: string, updates: Partial<BestellingLine>) {
    onLineUpdated(bestellingId, lineId, updates);
    setSelectedBestelling((current) =>
      current && current.id === bestellingId
        ? { ...current, lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...updates } : line)) }
        : current
    );
  }

  function sluitAfrondDialoog() {
    setAfrondKandidaten([]);
    setAfrondGenoten([]);
  }

  async function voerAfrondingUit(teAfronden: Bestelling[]) {
    // Zelfde slot als startAfronden: als er ergens al een ronde loopt (bulk,
    // deze functie zelf via een andere ingang, of de lookup-fase van
    // startAfronden), doet een tweede aanroep helemaal niets -- geen extra
    // PATCH-ronde, geen extra activiteitenlog-regels.
    if (afrondBezigRef.current) {
      // De aanroepers (onAlleenDeze/onOokDeze) ruimen de dialoog-UI hierna
      // sowieso onvoorwaardelijk op via hun eigen .then(), ongeacht of deze
      // ronde hier al dan niet daadwerkelijk heeft gedraaid. Zonder dit zou
      // afrondDialoogOpenRef op slot blijven staan terwijl de dialoog allang
      // van het scherm is verdwenen -- waarna startAfronden élke volgende
      // ronde stilzwijgend zou weigeren, tot een paginaherlaad toe.
      afrondDialoogOpenRef.current = false;
      return;
    }
    afrondBezigRef.current = true;
    setAfrondBezig(true);
    try {
      const { afgerond, mislukt } = await afrondBestellingen(teAfronden, actorFromMedewerker(user));
      afgerond.forEach((bestelling) => onBestellingUpdated(bestelling));
      // Alleen leegmaken als deze ronde daadwerkelijk vanuit de bulkselectie
      // is gestart -- zie de toelichting bij afrondUitSelectieRef hierboven.
      if (afrondUitSelectieRef.current) {
        setSelectedIds(new Set());
      }
      setAfrondFout(mislukt.length > 0 ? t('bestellingenAfrondenFout', { n: mislukt.length }) : null);
    } finally {
      afrondBezigRef.current = false;
      // Deze functie is precies de plek waar elke bevestigingsdialoog wordt
      // opgelost (via "alleen deze" of "ook deze"), dus hier hoort het
      // dialoog-slot ook weer vrij te komen. Was er nooit een dialoog (het
      // "genoten.length === 0"-pad in startAfronden), dan stond de ref al op
      // false en is dit een no-op.
      afrondDialoogOpenRef.current = false;
      setAfrondBezig(false);
    }
  }

  async function startAfronden(teAfronden: Bestelling[], vanuitSelectie: boolean) {
    if (teAfronden.length === 0) return;
    // Weiger meteen een nieuwe ronde zolang er al een bevestigingsdialoog op
    // een keuze wacht -- zie de toelichting bij afrondDialoogOpenRef hierboven.
    if (afrondDialoogOpenRef.current) return;
    // Synchrone slot-check: elke ingang (bulkknop, de losse "Afronden"-knop in
    // BestellingModal, straks eventueel nog een andere) roept uiteindelijk
    // startAfronden of voerAfrondingUit aan, en deze ref is de enige plek die
    // écht meteen weet of er al een ronde bezig is -- afrondBezig (state) kan
    // hier niet voor gebruikt worden, want de closure van een tweede,
    // gelijktijdige aanroep kan nog de oude (false) waarde zien voordat React
    // de update heeft doorgevoerd.
    if (afrondBezigRef.current) return;
    // Pas hier zetten -- ná beide guards -- zodat een geweigerde aanroep (een
    // heel andere bestelling terwijl deze ronde of een dialoog al loopt) de
    // herkomst-vlag van de ronde die daadwerkelijk bezig is nooit overschrijft.
    afrondUitSelectieRef.current = vanuitSelectie;
    afrondBezigRef.current = true;
    setAfrondFout(null);
    setAfrondBezig(true);

    let genoten: ZendingGenoten[] = [];
    try {
      const zendingen = await fetchZendingen(teAfronden.map((b) => b.id));
      genoten = openstaandeZendingGenoten(zendingen, teAfronden, bestellingen ?? []);
    } catch {
      // De zendinggenoot-melding is informatief. Faalt de lookup, dan is de
      // medewerker tegenhouden erger dan de hint missen -- gewoon afronden.
      genoten = [];
    } finally {
      // De ref beschermt hier alleen de lookup-fase. Of er nu meteen wordt
      // afgerond (voerAfrondingUit hieronder) of de bevestigingsdialoog wordt
      // getoond (waar de medewerker eerst moet kiezen), in beide gevallen
      // pakt de vervolgstap het slot zelf opnieuw -- dat gebeurt synchroon,
      // zonder await ertussen, dus er is geen gat waar een andere aanroep
      // tussendoor kan glippen.
      afrondBezigRef.current = false;
    }

    if (genoten.length === 0) {
      await voerAfrondingUit(teAfronden);
      return;
    }
    afrondDialoogOpenRef.current = true;
    setAfrondKandidaten(teAfronden);
    setAfrondGenoten(genoten);
    setAfrondBezig(false);
  }

  if (loadError) {
    return (
      <p data-testid="bestellingen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (bestellingen === null) {
    return null;
  }

  const selectieActief =
    statusFilter === 'Te versturen naar drukker' || statusFilter === 'Verstuurd naar drukker';

  // selectedIds zelf wordt pas in een useEffect opgeschoond nadat het filter
  // wisselt, dus in de render die direct op zo'n wissel volgt kan het nog
  // ids bevatten die niet meer bij het actieve filter horen. Deze afgeleide
  // waarde filtert daarop meteen in de render zelf -- geen effect-vertraging
  // -- zodat de selectiebalk nooit één render lang de verkeerde knop of een
  // verkeerde selectie aan een dialoog laat zien.
  const selectieVoorFilter = new Set(
    bestellingen.filter((b) => selectedIds.has(b.id) && b.status === statusFilter).map((b) => b.id)
  );

  const columns: Column<Bestelling>[] = [
    { key: 'bestelnr', label: t('bestellingenColBestelnummer') },
    { key: 'companyName', label: t('bestellingenColKlant') },
    { key: 'besteldatum', label: t('bestellingenColDatum') },
    {
      key: 'lineCount',
      label: t('bestellingenColAantal'),
      render: (row) => `${row.lineCount} / ${row.totalQuantity}`,
    },
    { key: 'status', label: t('bestellingenColStatus') },
  ];

  return (
    <div data-testid="bestellingen-section">
      {selectieVoorFilter.size > 0 && (
        <div
          data-testid="bestellingen-selectie-balk"
          className="mb-3 flex items-center justify-between gap-3 rounded-sm bg-white/5 px-3 py-2 text-xs"
        >
          <span>
            {t('bestellingenGeselecteerd', {
              count: selectieVoorFilter.size,
              klanten: new Set(
                bestellingen.filter((b) => selectieVoorFilter.has(b.id)).map((b) => b.klantId)
              ).size,
            })}
          </span>
          {statusFilter === 'Verstuurd naar drukker' ? (
            <button
              type="button"
              onClick={() =>
                void startAfronden(bestellingen.filter((b) => selectieVoorFilter.has(b.id)), true)
              }
              disabled={afrondBezig || afrondGenoten.length > 0}
              data-testid="bestellingen-afronden"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('bestellingenAfronden')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowVersturenDialog(true)}
              data-testid="bestellingen-versturen-naar-drukker"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenVersturenNaarDrukker')}
            </button>
          )}
        </div>
      )}
      <div className="mb-3 flex items-center justify-end">
        <HelpHint text={t('bestellingenHelp')} testId="bestellingen-help" />
      </div>
      {afrondFout && (
        <p data-testid="bestellingen-afronden-fout" className="mb-3 text-xs text-red-400">
          {afrondFout}
        </p>
      )}
      <DataTable<Bestelling>
        columns={columns}
        rows={bestellingen}
        getRowId={(row) => row.id}
        onRowClick={setSelectedBestelling}
        quickFilter={{
          key: 'status',
          value: statusFilter,
          onChange: setStatusFilter,
          options: [
            {
              value: 'Te versturen naar drukker',
              label: t('bestellingenQuickTeVersturenNaarDrukker'),
              testId: 'te-versturen',
            },
            {
              value: 'Verstuurd naar drukker',
              label: t('bestellingenQuickVerstuurdNaarDrukker'),
              testId: 'verstuurd',
            },
            { value: '', label: t('bestellingenQuickAlle'), testId: 'alle' },
          ],
        }}
        selection={
          selectieActief
            ? {
                selectedIds,
                onToggle: handleToggle,
                onToggleAll: handleToggleAll,
                isSelectable: (row) => row.status === statusFilter,
              }
            : undefined
        }
        emptyLabel={t('bestellingenEmpty')}
        searchPlaceholder={t('dataTableSearchPlaceholder')}
      />
      <BestellingModal
        bestelling={selectedBestelling}
        kunstwerken={kunstwerken}
        materialen={materialen}
        maten={maten}
        materiaalsoorten={materiaalsoorten}
        klanten={klanten}
        btwTarieven={btwTarieven}
        onClose={() => setSelectedBestelling(null)}
        onUpdated={(updated) => {
          onBestellingUpdated(updated);
          setSelectedBestelling(null);
        }}
        onAfronden={(bestelling) => {
          setSelectedBestelling(null);
          // Deze losse route rondt hoogstens deze ene bestelling af, die vaak
          // niet eens in de huidige bulkselectie zit -- die selectie mag hier
          // dus niet worden weggeveegd (zie afrondUitSelectieRef hierboven).
          void startAfronden([bestelling], false);
        }}
        onLinePrijsVastgesteld={handleLinePrijsVastgesteld}
        onLineUpdated={handleLineUpdated}
        // Ook uitgeschakeld terwijl de bevestigingsdialoog op een keuze wacht
        // (afrondGenoten.length > 0, dezelfde voorwaarde als de dialoog z'n
        // eigen isOpen hieronder) -- niet omdat het slot dat al niet zou
        // afdwingen (startAfronden weigert die ronde toch via
        // afrondDialoogOpenRef), maar voor de duidelijkheid richting de
        // medewerker: de knop hoort er dan zichtbaar uitgeschakeld uit te zien.
        isAfrondBezig={afrondBezig || afrondGenoten.length > 0}
      />
      <VersturenNaarDrukkerDialog
        isOpen={showVersturenDialog}
        onClose={() => setShowVersturenDialog(false)}
        bestellingen={bestellingen.filter((b) => selectieVoorFilter.has(b.id))}
        klanten={klanten ?? []}
        drukkers={drukkers ?? []}
        kunstwerken={kunstwerken ?? []}
        materialen={materialen ?? []}
        maten={maten ?? []}
        materiaalsoorten={materiaalsoorten ?? []}
        onVerstuurd={(updated) => {
          updated.forEach((bestelling) => onBestellingUpdated(bestelling));
          setSelectedIds(new Set());
          setShowVersturenDialog(false);
        }}
      />
      <AfrondenBevestigingDialog
        isOpen={afrondGenoten.length > 0}
        genoten={afrondGenoten}
        isBezig={afrondBezig}
        onAlleenDeze={() => {
          // Deze twee dialoogknoppen zijn de enige plekken die afrondKandidaten/
          // afrondGenoten mogen legen -- ze lossen immers de dialoog op die ze
          // zelf lieten zien. voerAfrondingUit zelf doet dat expliciet niet meer:
          // die wordt ook aangeroepen door een compleet losstaande ronde zonder
          // eigen dialoog (bijv. via de modal-knop), en die mag nooit een
          // ándere, nog openstaande bevestigingsdialoog wegklikken.
          void voerAfrondingUit(afrondKandidaten)
            .then(sluitAfrondDialoog)
            // Gooit er iets binnen voerAfrondingUit (bijvoorbeeld een van de
            // callback-props naar de rest van het scherm), dan mag de dialoog
            // niet blijven hangen en mag er geen onafgevangen rejection
            // overblijven -- dezelfde opruiming als bij een geslaagde ronde.
            .catch(sluitAfrondDialoog);
        }}
        onOokDeze={() => {
          void voerAfrondingUit([
            ...afrondKandidaten,
            ...afrondGenoten.flatMap((entry) => entry.bestellingen),
          ])
            .then(sluitAfrondDialoog)
            .catch(sluitAfrondDialoog);
        }}
        onClose={() => {
          // Hier wordt voerAfrondingUit niet aangeroepen (afrondBezigRef is
          // dus niet aan de orde), maar het dialoog-slot moet wel expliciet
          // vrijkomen -- annuleren is de enige weg terug die niet via
          // voerAfrondingUit's finally loopt.
          afrondDialoogOpenRef.current = false;
          setAfrondKandidaten([]);
          setAfrondGenoten([]);
          setAfrondFout(null);
        }}
      />
    </div>
  );
}
