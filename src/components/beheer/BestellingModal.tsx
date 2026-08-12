'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { HelpLink } from '@/components/HelpLink';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import { useAfwijzenBevestiging, AfwijzenBevestigingTekst, AfwijzenBevestigingActies } from './afwijzenBevestiging';
import { useBestellingHistorie } from '@/lib/useBestellingHistorie';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';
import { ProductImage } from '@/components/ProductImage';
import { Combobox } from '@/components/Combobox';
import type { Bestelling, BestellingLine } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';
import type { Bestelinstellingen } from './bestelinstellingenTypes';

const STATUS_BADGE_CLASS: Record<Bestelling['status'], string> = {
  'Te beoordelen': 'bg-amber-400/10 text-amber-300',
  'Te versturen naar drukker': 'bg-sky-400/10 text-sky-300',
  'Verstuurd naar drukker': 'bg-green-500/10 text-green-400',
  'Te factureren': 'bg-purple-400/10 text-purple-300',
  'Betaald en afgerond': 'bg-teal-400/10 text-teal-300',
  Afgewezen: 'bg-red-400/10 text-red-400',
};

interface LineDraft {
  materiaalId: string;
  maatId: string;
  breedte: string;
  hoogte: string;
  prijs: string;
  quantity: string;
}

interface ConceptUpdate {
  materiaalId?: string;
  maatId?: string;
  breedte?: number;
  hoogte?: number;
  prijs?: number | null;
  quantity?: number;
}

interface ConceptAddition {
  tempId: string;
  kunstwerkId: string;
  materiaalId: string;
  maatId: string;
  breedte?: number;
  hoogte?: number;
  quantity: number;
}

interface BestellingModalProps {
  bestelling: Bestelling | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
  bestelinstellingen: Bestelinstellingen | null;
  onClose: () => void;
  onUpdated: (bestelling: Bestelling) => void;
  onAfronden: (bestelling: Bestelling) => void;
  onBestellingGewijzigd: (bestelling: Bestelling) => void;
  /** True zolang ergens (bulkknop, bevestigingsdialoog, of deze knop zelf elders) een
   * afrondronde loopt -- schakelt de "Afronden"-knop uit zodat deze derde ingang naar
   * startAfronden niet buiten de gedeelde afrondBezig-mutex om kan lopen. */
  isAfrondBezig?: boolean;
}

function isCustomLine(line: BestellingLine): boolean {
  return !line.maatId;
}

// Verbergt de native up/down-spinner van een number-input (WebKit + Firefox) -- zonder
// label las die spinner soms als een sliderbediening, en de pijltjes voegden verder
// niets toe aan deze kleine, veelal 1-3-cijferige velden.
const GEEN_SPINNER =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none';

function Veld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] text-white/35">{label}</span>
      {children}
    </label>
  );
}

const HISTORIE_LABEL_KEY: Record<string, string> = {
  'Te beoordelen': 'bestellingenHistorieTeBeoordelen',
  'Te versturen naar drukker': 'bestellingenHistorieTeVersturenNaarDrukker',
  'Verstuurd naar drukker': 'bestellingenHistorieVerstuurdNaarDrukker',
  'Te factureren': 'bestellingenHistorieTeFactureren',
  'Betaald en afgerond': 'bestellingenHistorieAfgerond',
  Afgewezen: 'bestellingenHistorieAfgewezen',
};

export function BestellingModal({
  bestelling,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  btwTarieven,
  bestelinstellingen,
  onClose,
  onUpdated,
  onAfronden,
  onBestellingGewijzigd,
  isAfrondBezig = false,
}: BestellingModalProps) {
  const t = useTranslations('beheer');
  const [error, setError] = useState<string | null>(null);
  const [prijsDrafts, setPrijsDrafts] = useState<Record<string, string>>({});
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<LineDraft | null>(null);
  const [conceptUpdates, setConceptUpdates] = useState<Record<string, ConceptUpdate>>({});
  const [conceptDeletions, setConceptDeletions] = useState<Set<string>>(new Set());
  const [conceptAdditions, setConceptAdditions] = useState<ConceptAddition[]>([]);
  const [toonNieuweRegel, setToonNieuweRegel] = useState(false);
  const [toonMailVraag, setToonMailVraag] = useState(false);
  const [conceptKorting, setConceptKorting] = useState<string>('');
  const [nieuweRegelDraft, setNieuweRegelDraft] = useState({
    kunstwerkId: '',
    materiaalId: '',
    maatId: '',
    breedte: '',
    hoogte: '',
    quantity: '1',
  });
  const [nieuweRegelPrijsvoorbeeld, setNieuweRegelPrijsvoorbeeld] = useState<
    { status: 'laden' } | { status: 'vast'; prijs: number } | { status: 'op-aanvraag' } | { status: 'onbekend' } | null
  >(null);
  const [nieuweRegelError, setNieuweRegelError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAdminAuth();
  const { historie } = useBestellingHistorie(bestelling?.id ?? null);
  const bevestigingAfwijzen = useAfwijzenBevestiging();

  useEffect(() => {
    if (bestelling) {
      setError(null);
      setPrijsDrafts({});
      setEditingLineId(null);
      setLineDraft(null);
      setConceptUpdates({});
      setConceptDeletions(new Set());
      setConceptAdditions([]);
      setToonNieuweRegel(false);
      setToonMailVraag(false);
      setConceptKorting(bestelling.korting != null ? String(bestelling.korting) : '');
      // effectiveMinimaleAfname (afgeleid van klanten/bestelinstellingen) bewust buiten de
      // dependency-array: die resolven al ruim voordat een medewerker deze modal opent, en
      // opnieuw resetten zodra ze wijzigen zou een net ingevulde nieuwe-regel-draft overschrijven.
      setNieuweRegelDraft({
        kunstwerkId: '',
        materiaalId: '',
        maatId: '',
        breedte: '',
        hoogte: '',
        quantity: String(effectiveMinimaleAfname),
      });
      setNieuweRegelPrijsvoorbeeld(null);
      setNieuweRegelError(null);
      bevestigingAfwijzen.annuleer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestelling?.id]);

  // Live prijsvoorbeeld voor "Regel toevoegen": herberekent zodra kunstwerk/materiaal/maat
  // (of, bij eigen maat, breedte/hoogte) compleet zijn, gedebounced zodat elke toetsaanslag
  // in breedte/hoogte niet meteen een aparte aanvraag stuurt. Roept dezelfde
  // resolveerBestellijnPrijs aan als de echte opslag (via .../prijsvoorbeeld), dus dit
  // voorbeeld kan nooit afwijken van de prijs die "Wijzigingen opslaan" straks berekent.
  useEffect(() => {
    if (!bestelling || !toonNieuweRegel) {
      setNieuweRegelPrijsvoorbeeld(null);
      return;
    }
    const kunstwerk = (kunstwerken ?? []).find((k) => k.id === nieuweRegelDraft.kunstwerkId);
    if (!kunstwerk || !nieuweRegelDraft.materiaalId) {
      setNieuweRegelPrijsvoorbeeld(null);
      return;
    }
    const isEigenMaat = kunstwerk.maatIds.length === 0;
    const breedte = Number(nieuweRegelDraft.breedte);
    const hoogte = Number(nieuweRegelDraft.hoogte);
    if (isEigenMaat ? !breedte || breedte <= 0 || !hoogte || hoogte <= 0 : !nieuweRegelDraft.maatId) {
      setNieuweRegelPrijsvoorbeeld(null);
      return;
    }

    setNieuweRegelPrijsvoorbeeld({ status: 'laden' });
    const timeoutId = window.setTimeout(async () => {
      const params = new URLSearchParams({
        kunstwerkId: nieuweRegelDraft.kunstwerkId,
        materiaalId: nieuweRegelDraft.materiaalId,
        maatId: isEigenMaat ? '' : nieuweRegelDraft.maatId,
      });
      if (isEigenMaat) {
        params.set('breedte', nieuweRegelDraft.breedte);
        params.set('hoogte', nieuweRegelDraft.hoogte);
      }
      try {
        const response = await fetch(`/api/bestelheaders/${bestelling.id}/prijsvoorbeeld?${params.toString()}`);
        if (!response.ok) {
          setNieuweRegelPrijsvoorbeeld({ status: 'onbekend' });
          return;
        }
        const body = (await response.json()) as { status: 'vast' | 'op-aanvraag' | 'onbekend'; prijs?: number };
        setNieuweRegelPrijsvoorbeeld(
          body.status === 'vast' ? { status: 'vast', prijs: body.prijs as number } : { status: body.status }
        );
      } catch {
        setNieuweRegelPrijsvoorbeeld({ status: 'onbekend' });
      }
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bestelling?.id,
    toonNieuweRegel,
    nieuweRegelDraft.kunstwerkId,
    nieuweRegelDraft.materiaalId,
    nieuweRegelDraft.maatId,
    nieuweRegelDraft.breedte,
    nieuweRegelDraft.hoogte,
    kunstwerken,
  ]);

  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijvingNl])
  );

  const klant = bestelling ? (klanten ?? []).find((k) => k.klantnr === bestelling.klantnr) : undefined;
  const effectiveMinimaleAfname = klant?.minimaleAfname ?? bestelinstellingen?.minimaleAfname ?? 1;
  const land = klant ? klant.invoiceLand || klant.land || null : null;
  const klantBtwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
  const conceptKortingValue = conceptKorting.trim() === '' ? null : Number(conceptKorting);
  const kortingGewijzigd = !!bestelling && conceptKortingValue !== (bestelling.korting ?? null);
  // Overlaat van bestelling.lines met de conceptwijzigingen (updates/deletions) erin verwerkt,
  // zodat totalen/heeftOngeprijsdeRegel/Goedkeuren live meebewegen met wat de medewerker nog
  // aan het bewerken is, in plaats van pas na Wijzigingen opslaan. conceptAdditions blijft hier
  // bewust buiten: hun prijs is pas na opslaan bekend (zie "prijs bekend na opslaan" verderop).
  const weergaveLines = bestelling
    ? bestelling.lines
        .filter((line) => !conceptDeletions.has(line.id))
        .map((line) => (conceptUpdates[line.id] ? { ...line, ...conceptUpdates[line.id] } : line))
    : [];
  const totalen = bestelling
    ? berekenBestellingTotalen(weergaveLines, conceptKortingValue, klantBtwPercentage)
    : null;
  const heeftOngeprijsdeRegel = totalen?.heeftOngeprijsdeRegel ?? false;
  const totaalWeergave =
    bestelling && bestelling.lines.length > 0
      ? heeftOngeprijsdeRegel
        ? t('bestellingenModalTotalIncomplete')
        : formatCurrency(totalen!.totaalExclBtw!)
      : null;
  // Subtotaal (vóór korting) staat alleen boven het totaal wanneer er ook een kortingregel
  // te zien is -- anders zijn ze aan elkaar gelijk en voegt de extra regel niets toe.
  const toontKortingRij = bestelling ? bestelling.status !== 'Afgewezen' || (totalen != null && totalen.korting > 0) : false;
  const subtotaalWeergave =
    toontKortingRij && bestelling && bestelling.lines.length > 0
      ? heeftOngeprijsdeRegel
        ? t('bestellingenModalTotalIncomplete')
        : formatCurrency(totalen!.regelsom!)
      : null;
  const btwPercentage = totalen?.btwPercentage ?? null;
  const btwBedrag = totalen?.btwBedrag ?? null;
  const totaalInclBtw = totalen?.totaalInclBtw ?? null;

  const REGELSTRUCTUUR_OP_SLOT_STATUSSEN = ['Verstuurd naar drukker', 'Te factureren', 'Betaald en afgerond'];
  const regelstructuurBewerkbaar =
    !!bestelling && bestelling.status !== 'Afgewezen' && !REGELSTRUCTUUR_OP_SLOT_STATUSSEN.includes(bestelling.status);

  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_goedgekeurd', bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Te versturen naar drukker' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleAfwijzen(reden: string) {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen', afwijsreden: reden }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgewezen', `${bestelling.bestelnr}: ${reden}`);
      onUpdated({ ...bestelling, status: 'Afgewezen', afwijsreden: reden });
      bevestigingAfwijzen.annuleer();
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  function handleAfronden() {
    if (!bestelling) return;
    onAfronden(bestelling);
  }

  async function handleFactureren() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Betaald en afgerond' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_gefactureerd', bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Betaald en afgerond' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function terugzettenNaar(status: 'Verstuurd naar drukker' | 'Te factureren') {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afronding_teruggezet', bestelling.bestelnr);
      onUpdated({ ...bestelling, status });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  function handlePrijsVaststellen(line: BestellingLine) {
    const prijs = Number(prijsDrafts[line.id]);
    if (!prijs || prijs <= 0) return;
    setConceptUpdates((current) => ({ ...current, [line.id]: { ...current[line.id], prijs } }));
    setPrijsDrafts((current) => {
      const { [line.id]: _verwijderd, ...rest } = current;
      return rest;
    });
  }

  function startEditRegel(line: BestellingLine) {
    setEditingLineId(line.id);
    setLineDraft({
      materiaalId: line.materiaalId ?? '',
      maatId: line.maatId ?? '',
      breedte: line.breedte != null ? String(line.breedte) : '',
      hoogte: line.hoogte != null ? String(line.hoogte) : '',
      prijs: line.prijs != null ? String(line.prijs) : '',
      quantity: String(line.quantity),
    });
  }

  function cancelEditRegel() {
    setEditingLineId(null);
    setLineDraft(null);
  }

  function handleOpslaanRegel(line: BestellingLine) {
    if (!lineDraft) return;
    const prijs = lineDraft.prijs === '' ? null : Number(lineDraft.prijs);
    if (prijs !== null && prijs <= 0) return;

    // Zodra de regelstructuur op slot zit (zie REGELSTRUCTUUR_OP_SLOT_STATUSSEN in de
    // wijzigen-route) mag alleen de prijs nog wijzigen -- materiaal/maat/aantal worden dan niet
    // eens getoond als invoerveld, dus lineDraft's waarden daarvoor zijn ongewijzigd en horen
    // niet mee in de patch (de server wijst zo'n patch anders sowieso af).
    if (!regelstructuurBewerkbaar) {
      setConceptUpdates((current) => ({ ...current, [line.id]: { ...current[line.id], prijs } }));
      cancelEditRegel();
      return;
    }

    const quantity = Number(lineDraft.quantity);
    if (!lineDraft.materiaalId || !quantity || quantity <= 0) return;

    const patch: ConceptUpdate = { materiaalId: lineDraft.materiaalId, prijs, quantity };
    if (isCustomLine(line)) {
      const breedte = Number(lineDraft.breedte);
      const hoogte = Number(lineDraft.hoogte);
      if (!breedte || breedte <= 0 || !hoogte || hoogte <= 0) return;
      patch.maatId = '';
      patch.breedte = breedte;
      patch.hoogte = hoogte;
    } else {
      if (!lineDraft.maatId) return;
      patch.maatId = lineDraft.maatId;
    }

    setConceptUpdates((current) => ({ ...current, [line.id]: { ...current[line.id], ...patch } }));
    cancelEditRegel();
  }

  function markeerVoorVerwijdering(lineId: string) {
    setConceptDeletions((current) => new Set(current).add(lineId));
  }

  function maakVerwijderingOngedaan(lineId: string) {
    setConceptDeletions((current) => {
      const next = new Set(current);
      next.delete(lineId);
      return next;
    });
  }

  // Zet altijd óf een concept-toevoeging óf een concrete foutmelding -- nooit stilzwijgend
  // niets doen. Een uitgeschakelde knop zonder uitleg liet een medewerker eerder denken dat
  // een regel was toegevoegd terwijl dat niet zo was (die zag pas bij "Wijzigingen opslaan"
  // dat de regel er niet bij stond, zonder te weten waarom).
  function handleNieuweRegelToevoegen() {
    const kunstwerk = (kunstwerken ?? []).find((k) => k.id === nieuweRegelDraft.kunstwerkId);
    if (!kunstwerk) {
      setNieuweRegelError(t('bestellingenRegelToevoegenFoutKunstwerk'));
      return;
    }
    if (!nieuweRegelDraft.materiaalId) {
      setNieuweRegelError(t('bestellingenRegelToevoegenFoutMateriaal'));
      return;
    }
    const isEigenMaat = kunstwerk.maatIds.length === 0;
    const quantity = Number(nieuweRegelDraft.quantity);
    if (isEigenMaat) {
      const breedte = Number(nieuweRegelDraft.breedte);
      const hoogte = Number(nieuweRegelDraft.hoogte);
      if (!breedte || breedte <= 0 || !hoogte || hoogte <= 0) {
        setNieuweRegelError(t('bestellingenRegelToevoegenFoutAfmeting'));
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setNieuweRegelError(t('bestellingenRegelToevoegenFoutAantal'));
        return;
      }
      if (quantity < effectiveMinimaleAfname) {
        setNieuweRegelError(t('bestellingenRegelToevoegenFoutMinimum', { minimum: effectiveMinimaleAfname }));
        return;
      }
      setNieuweRegelError(null);
      setConceptAdditions((current) => [
        ...current,
        {
          tempId: `nieuw-${current.length}-${Date.now()}`,
          kunstwerkId: kunstwerk.id,
          materiaalId: nieuweRegelDraft.materiaalId,
          maatId: '',
          breedte,
          hoogte,
          quantity,
        },
      ]);
    } else {
      if (!nieuweRegelDraft.maatId) {
        setNieuweRegelError(t('bestellingenRegelToevoegenFoutMaat'));
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setNieuweRegelError(t('bestellingenRegelToevoegenFoutAantal'));
        return;
      }
      if (quantity < effectiveMinimaleAfname) {
        setNieuweRegelError(t('bestellingenRegelToevoegenFoutMinimum', { minimum: effectiveMinimaleAfname }));
        return;
      }
      setNieuweRegelError(null);
      setConceptAdditions((current) => [
        ...current,
        {
          tempId: `nieuw-${current.length}-${Date.now()}`,
          kunstwerkId: kunstwerk.id,
          materiaalId: nieuweRegelDraft.materiaalId,
          maatId: nieuweRegelDraft.maatId,
          quantity,
        },
      ]);
    }
    setNieuweRegelDraft({
      kunstwerkId: '',
      materiaalId: '',
      maatId: '',
      breedte: '',
      hoogte: '',
      quantity: String(effectiveMinimaleAfname),
    });
    setNieuweRegelPrijsvoorbeeld(null);
    setToonNieuweRegel(false);
  }

  const nieuweRegelAantal = Number(nieuweRegelDraft.quantity);

  const heeftConceptWijziging =
    Object.keys(conceptUpdates).length > 0 ||
    conceptDeletions.size > 0 ||
    conceptAdditions.length > 0 ||
    kortingGewijzigd;

  async function handleWijzigingenOpslaan() {
    if (!bestelling) return;
    setSaving(true);
    setError(null);
    try {
      const updates = Object.entries(conceptUpdates).map(([id, patch]) => ({ id, ...patch }));
      const additions = conceptAdditions.map(({ tempId: _tempId, ...addition }) => addition);
      const deletions = Array.from(conceptDeletions);
      const response = await fetch(`/api/bestelheaders/${bestelling.id}/wijzigen`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ korting: conceptKortingValue, updates, additions, deletions }),
      });
      if (!response.ok) throw new Error('wijzigen failed');
      const body = (await response.json()) as { lines: BestellingLine[]; korting: number | null };
      void logActiviteit('bestelling_gewijzigd', bestelling.bestelnr);
      onBestellingGewijzigd({ ...bestelling, lines: body.lines, korting: body.korting });
      setConceptUpdates({});
      setConceptDeletions(new Set());
      setConceptAdditions([]);
      setConceptKorting(body.korting != null ? String(body.korting) : '');
      setToonMailVraag(true);
    } catch {
      setError(t('bestellingenActionError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleMailJa() {
    if (!bestelling) return;
    try {
      await fetch('/api/mail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ soort: 'bestelwijziging', bestelheaderId: bestelling.id }),
      });
    } finally {
      setToonMailVraag(false);
    }
  }

  function handleMailNee() {
    setToonMailVraag(false);
  }

  return (
    <Modal
      isOpen={bestelling !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={
        <span className="flex w-full items-center justify-between gap-2 pr-2">
          {t('bestellingenModalTitel')}
          <HelpLink
            anchor="bestelproces-bewerken"
            label="Open het hoofdstuk over een bestelling bewerken"
            testId="bestelling-modal-help"
          />
        </span>
      }
      subtitle={
        bestelling ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col items-start gap-1">
              <span>
                {bestelling.bestelnr} · {bestelling.companyName} · {bestelling.besteldatum}
              </span>
              {bestelling.zendingnummer && (
                <span className="text-xs text-white/50">{bestelling.zendingnummer}</span>
              )}
              <span
                data-testid="bestelling-modal-status"
                className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[bestelling.status]}`}
              >
                {bestelling.status}
              </span>
              {bestelling.status === 'Afgewezen' && bestelling.afwijsreden && (
                <p data-testid="bestelling-modal-afwijsreden" className="text-xs text-white/60">
                  {t('afwijsredenLabel')}: {bestelling.afwijsreden}
                </p>
              )}
            </div>
            {totaalWeergave !== null && (
              <div className="grid shrink-0 grid-cols-[auto_auto] items-baseline gap-x-2 gap-y-0.5">
                {subtotaalWeergave !== null && (
                  <div data-testid="bestelling-modal-subtotaal" className="contents">
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('bestellingenModalSubtotaalLabel')}
                    </span>
                    <span className="text-right text-sm text-white/80 tabular-nums">{subtotaalWeergave}</span>
                  </div>
                )}
                {bestelling.status === 'Afgewezen' ? (
                  totalen && totalen.korting > 0 && (
                    <div data-testid="bestelling-modal-korting" className="contents">
                      <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                        {t('bestellingenModalKortingLabel')}
                      </span>
                      <span className="text-right text-sm text-white/80 tabular-nums">
                        -{formatCurrency(totalen.korting)}
                      </span>
                    </div>
                  )
                ) : (
                  <div className="contents">
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('bestellingenModalKortingLabel')}
                    </span>
                    <div className="flex items-center justify-self-end gap-1 rounded-sm bg-black/40 px-2 py-1">
                      <span className="text-xs text-white/40">€</span>
                      <input
                        type="number"
                        min="0"
                        data-testid="bestelling-modal-korting-input"
                        value={conceptKorting}
                        onChange={(event) => setConceptKorting(event.target.value)}
                        className={`w-14 bg-transparent text-right text-xs text-white outline-none ${GEEN_SPINNER}`}
                      />
                    </div>
                  </div>
                )}
                <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                  {t('bestellingenModalTotalLabel')}
                </span>
                <span
                  data-testid="bestelling-modal-total"
                  className="text-right text-sm font-semibold text-white tabular-nums"
                >
                  {totaalWeergave}
                </span>
                {btwBedrag !== null && (
                  <div data-testid="bestelling-modal-btw" className="contents">
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('bestellingenModalBtwLabel', { percentage: btwPercentage })}
                    </span>
                    <span className="text-right text-sm text-white/80 tabular-nums">{formatCurrency(btwBedrag)}</span>
                  </div>
                )}
                {totaalInclBtw !== null && (
                  <>
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('bestellingenModalTotaalInclLabel')}
                    </span>
                    <span
                      data-testid="bestelling-modal-totaal-incl"
                      className="text-right text-sm font-semibold text-white tabular-nums"
                    >
                      {formatCurrency(totaalInclBtw)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        ) : undefined
      }
      footerActions={
        bestelling && bestelling.status === 'Te beoordelen' ? (
          bevestigingAfwijzen.open ? (
            <AfwijzenBevestigingActies
              reden={bevestigingAfwijzen.reden}
              onBevestig={() => handleAfwijzen(bevestigingAfwijzen.reden)}
              onAnnuleer={bevestigingAfwijzen.annuleer}
              testIdPrefix="bestelling"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoedkeuren}
                disabled={heeftOngeprijsdeRegel}
                data-testid="bestelling-modal-goedkeuren"
                className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
              >
                {t('bestellingenGoedkeuren')}
              </button>
              <button
                type="button"
                onClick={bevestigingAfwijzen.vraag}
                data-testid="bestelling-modal-afwijzen"
                className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('bestellingenAfwijzen')}
              </button>
            </>
          )
        ) : bestelling && bestelling.status === 'Verstuurd naar drukker' ? (
          <button
            type="button"
            onClick={handleAfronden}
            disabled={isAfrondBezig}
            data-testid="bestelling-modal-afronden"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('bestellingenAfronden')}
          </button>
        ) : bestelling && bestelling.status === 'Te factureren' ? (
          <>
            <button
              type="button"
              onClick={handleFactureren}
              data-testid="bestelling-modal-factureren"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('bestellingenFactureren')}
            </button>
            <button
              type="button"
              onClick={() => terugzettenNaar('Verstuurd naar drukker')}
              data-testid="bestelling-modal-terugzetten-naar-verstuurd"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenTerugzetten')}
            </button>
          </>
        ) : bestelling && bestelling.status === 'Betaald en afgerond' ? (
          <button
            type="button"
            onClick={() => terugzettenNaar('Te factureren')}
            data-testid="bestelling-modal-terugzetten"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('bestellingenFactureringTerugzetten')}
          </button>
        ) : null
      }
    >
      {bestelling && (
        <>
          {error && (
            <p data-testid="bestelling-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}
          <div
            data-testid="bestelling-modal"
            hidden={bevestigingAfwijzen.open}
            className={`${bevestigingAfwijzen.open ? 'hidden' : 'flex'} flex-col gap-3 text-sm text-white/80`}
          >
            <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto text-xs">
              {bestelling.lines.map((line) => {
                const kunstwerk = (kunstwerken ?? []).find((k) => k.code === line.code) ?? null;
                const isEditingLine = editingLineId === line.id;
                const conceptPatch = conceptUpdates[line.id];
                const weergaveLine = conceptPatch ? { ...line, ...conceptPatch } : line;
                const materiaal = (materialen ?? []).find((m) => m.id === weergaveLine.materiaalId);
                const maat = (maten ?? []).find((m) => m.id === weergaveLine.maatId);
                const maatWeergave = maat
                  ? `${maat.breedte}×${maat.hoogte} cm`
                  : weergaveLine.breedte != null && weergaveLine.hoogte != null
                    ? `${weergaveLine.breedte}×${weergaveLine.hoogte} cm`
                    : t('bestellingenRegelOnbekend');
                const kunstwerkMaterialen = kunstwerk
                  ? (materialen ?? []).filter((m) => kunstwerk.materiaalIds.includes(m.id))
                  : [];
                const kunstwerkMaten = kunstwerk
                  ? (maten ?? []).filter((m) => kunstwerk.maatIds.includes(m.id))
                  : [];

                return (
                  <li
                    key={line.id}
                    data-testid={`bestelling-modal-line-${line.id}`}
                    className={`flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3 ${
                      conceptDeletions.has(line.id) ? 'opacity-40 line-through' : ''
                    }`}
                  >
                    {kunstwerk ? (
                      <ProductImage src={kunstwerk.foto} alt="" className="h-[72px] w-[72px] shrink-0 rounded-md" />
                    ) : (
                      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                        ?
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-white/90">
                        {kunstwerk ? kunstwerk.omschrijvingNl : t('bestellingenRegelOnbekend')}
                      </p>

                      {!isEditingLine ? (
                        <>
                          {kunstwerk && (
                            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-white/60">
                              <span className="text-white/35">{t('bestellingenModalLabelCode')}</span>
                              <span>{kunstwerk.code}</span>
                              <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}</span>
                              <span>
                                {materiaal
                                  ? `${materiaal.materiaaldikte}mm ${
                                      materiaalsoortNaamById.get(materiaal.materiaalsoortId) ??
                                      materiaal.materiaalsoortId
                                    } — ${materiaal.omschrijvingNl}`
                                  : t('bestellingenRegelOnbekend')}
                              </span>
                              <span className="text-white/35">{t('bestellingenModalLabelMaat')}</span>
                              <span>{maatWeergave}</span>
                            </div>
                          )}
                          <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-1.5">
                            {weergaveLine.prijs !== null ? (
                              <>
                                <span className="text-white/45">
                                  {weergaveLine.quantity} × {formatCurrency(weergaveLine.prijs)}
                                </span>
                                <span className="font-semibold text-white/90">
                                  {formatCurrency(weergaveLine.prijs * weergaveLine.quantity)}
                                </span>
                              </>
                            ) : (
                              <span className="text-white/45">{t('bestellingenModalPrijsOpAanvraag')}</span>
                            )}
                          </div>
                          {weergaveLine.prijs === null && (
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="number"
                                data-testid={`bestelling-modal-prijs-input-${line.id}`}
                                value={prijsDrafts[line.id] ?? ''}
                                onChange={(event) =>
                                  setPrijsDrafts((current) => ({ ...current, [line.id]: event.target.value }))
                                }
                                className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                              />
                              <button
                                type="button"
                                data-testid={`bestelling-modal-prijs-vaststellen-${line.id}`}
                                onClick={() => handlePrijsVaststellen(line)}
                                disabled={!prijsDrafts[line.id] || Number(prijsDrafts[line.id]) <= 0}
                                className="btn-beheer-secondary rounded-sm border border-white/20 px-2 py-1 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
                              >
                                {t('bestellingenModalPrijsVaststellen')}
                              </button>
                            </div>
                          )}
                          <div className="mt-1.5 flex gap-3">
                            {kunstwerk && (
                              <button
                                type="button"
                                onClick={() => startEditRegel(weergaveLine)}
                                data-testid={`bestelling-modal-regel-bewerken-${line.id}`}
                                className="text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                              >
                                {t('bewerken')}
                              </button>
                            )}
                            {regelstructuurBewerkbaar &&
                              (conceptDeletions.has(line.id) ? (
                                <button
                                  type="button"
                                  onClick={() => maakVerwijderingOngedaan(line.id)}
                                  data-testid={`bestelling-modal-regel-verwijderen-ongedaan-${line.id}`}
                                  className="text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                                >
                                  {t('bestellingenRegelVerwijderenOngedaanMaken')}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => markeerVoorVerwijdering(line.id)}
                                  data-testid={`bestelling-modal-regel-verwijderen-${line.id}`}
                                  className="text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                                >
                                  {t('bestellingenRegelVerwijderen')}
                                </button>
                              ))}
                          </div>
                        </>
                      ) : (
                        <div className="mt-1.5 flex flex-col gap-2">
                          {regelstructuurBewerkbaar ? (
                            <>
                              <Veld label={t('bestellingenModalLabelMateriaal')}>
                              <select
                                value={lineDraft?.materiaalId ?? ''}
                                onChange={(event) =>
                                  setLineDraft((current) =>
                                    current ? { ...current, materiaalId: event.target.value } : current
                                  )
                                }
                                data-testid={`bestelling-modal-regel-materiaal-${line.id}`}
                                className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                              >
                                {kunstwerkMaterialen.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.materiaaldikte}mm {materiaalsoortNaamById.get(m.materiaalsoortId) ?? m.materiaalsoortId}
                                  </option>
                                ))}
                              </select>
                              </Veld>

                              {isCustomLine(line) ? (
                                <div className="flex gap-2">
                                  <Veld label={t('matenLabelBreedte')}>
                                  <input
                                    type="number"
                                    value={lineDraft?.breedte ?? ''}
                                    onChange={(event) =>
                                      setLineDraft((current) =>
                                        current ? { ...current, breedte: event.target.value } : current
                                      )
                                    }
                                    data-testid={`bestelling-modal-regel-breedte-${line.id}`}
                                    className={`w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                                  />
                                  </Veld>
                                  <Veld label={t('matenLabelHoogte')}>
                                  <input
                                    type="number"
                                    value={lineDraft?.hoogte ?? ''}
                                    onChange={(event) =>
                                      setLineDraft((current) =>
                                        current ? { ...current, hoogte: event.target.value } : current
                                      )
                                    }
                                    data-testid={`bestelling-modal-regel-hoogte-${line.id}`}
                                    className={`w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                                  />
                                  </Veld>
                                </div>
                              ) : (
                                <Veld label={t('bestellingenModalLabelMaat')}>
                                <select
                                  value={lineDraft?.maatId ?? ''}
                                  onChange={(event) =>
                                    setLineDraft((current) =>
                                      current ? { ...current, maatId: event.target.value } : current
                                    )
                                  }
                                  data-testid={`bestelling-modal-regel-maat-${line.id}`}
                                  className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                                >
                                  {kunstwerkMaten.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.breedte}×{m.hoogte} cm
                                    </option>
                                  ))}
                                </select>
                                </Veld>
                              )}
                            </>
                          ) : (
                            <div
                              data-testid={`bestelling-modal-regel-structuur-op-slot-${line.id}`}
                              className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs text-white/60"
                            >
                              <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}</span>
                              <span>
                                {materiaal
                                  ? `${materiaal.materiaaldikte}mm ${
                                      materiaalsoortNaamById.get(materiaal.materiaalsoortId) ??
                                      materiaal.materiaalsoortId
                                    } — ${materiaal.omschrijvingNl}`
                                  : t('bestellingenRegelOnbekend')}
                              </span>
                              <span className="text-white/35">{t('bestellingenModalLabelMaat')}</span>
                              <span>{maatWeergave}</span>
                              <span className="text-white/35">{t('bestellingenModalLabelAantal')}</span>
                              <span>{weergaveLine.quantity}</span>
                              <span className="text-white/35">{t('bestellingenModalLabelPrijs')}</span>
                              <input
                                type="number"
                                value={lineDraft?.prijs ?? ''}
                                onChange={(event) =>
                                  setLineDraft((current) =>
                                    current ? { ...current, prijs: event.target.value } : current
                                  )
                                }
                                data-testid={`bestelling-modal-regel-prijs-${line.id}`}
                                className={`w-24 justify-self-start rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                              />
                            </div>
                          )}

                          {regelstructuurBewerkbaar && (
                            <div className="flex gap-2">
                              <Veld label={t('bestellingenModalLabelAantal')}>
                              <input
                                type="number"
                                min={1}
                                value={lineDraft?.quantity ?? ''}
                                onChange={(event) =>
                                  setLineDraft((current) =>
                                    current ? { ...current, quantity: event.target.value } : current
                                  )
                                }
                                data-testid={`bestelling-modal-regel-aantal-${line.id}`}
                                className={`w-16 rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                              />
                              </Veld>
                              <Veld label={t('bestellingenModalLabelPrijs')}>
                              <input
                                type="number"
                                value={lineDraft?.prijs ?? ''}
                                onChange={(event) =>
                                  setLineDraft((current) =>
                                    current ? { ...current, prijs: event.target.value } : current
                                  )
                                }
                                data-testid={`bestelling-modal-regel-prijs-${line.id}`}
                                className={`w-24 rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                              />
                              </Veld>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpslaanRegel(line)}
                              data-testid={`bestelling-modal-regel-opslaan-${line.id}`}
                              className="btn-beheer-primary rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink"
                            >
                              {t('bestellingenModalRegelOpslaan')}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditRegel}
                              data-testid={`bestelling-modal-regel-annuleren-${line.id}`}
                              className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                            >
                              {t('annuleren')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {regelstructuurBewerkbaar && (
              <div className="flex flex-col gap-2">
                {conceptAdditions.map((addition) => {
                  const kunstwerk = (kunstwerken ?? []).find((k) => k.id === addition.kunstwerkId);
                  const materiaal = (materialen ?? []).find((m) => m.id === addition.materiaalId);
                  const maat = (maten ?? []).find((m) => m.id === addition.maatId);
                  const maatWeergave = maat
                    ? `${maat.breedte}×${maat.hoogte} cm`
                    : addition.breedte != null && addition.hoogte != null
                      ? `${addition.breedte}×${addition.hoogte} cm`
                      : '';
                  return (
                    <div
                      key={addition.tempId}
                      data-testid={`bestelling-modal-nieuwe-regel-kaart-${addition.tempId}`}
                      className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                    >
                      {kunstwerk ? (
                        <ProductImage src={kunstwerk.foto} alt="" className="h-[72px] w-[72px] shrink-0 rounded-md" />
                      ) : (
                        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                          ?
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 font-semibold text-white/90">
                          {kunstwerk ? kunstwerk.omschrijvingNl : t('bestellingenRegelOnbekend')}
                        </p>
                        <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-white/60">
                          <span className="text-white/35">{t('bestellingenModalLabelCode')}</span>
                          <span>{kunstwerk?.code ?? addition.kunstwerkId}</span>
                          <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}</span>
                          <span>
                            {materiaal
                              ? `${materiaal.materiaaldikte}mm ${
                                  materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId
                                } — ${materiaal.omschrijvingNl}`
                              : addition.materiaalId}
                          </span>
                          <span className="text-white/35">{t('bestellingenModalLabelMaat')}</span>
                          <span>{maatWeergave}</span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-1.5">
                          <span className="text-white/45">
                            {addition.quantity} × {t('bestellingenRegelPrijsNaOpslaan')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setConceptAdditions((current) => current.filter((a) => a.tempId !== addition.tempId))
                          }
                          data-testid={`bestelling-modal-nieuwe-regel-verwijderen-${addition.tempId}`}
                          className="mt-1.5 text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                        >
                          {t('bestellingenRegelVerwijderen')}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {toonNieuweRegel ? (
                  <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.02] p-3">
                    <Veld label={t('bestellingenModalLabelCode')}>
                      <Combobox
                        options={(kunstwerken ?? []).map((k) => ({ value: k.id, label: k.code }))}
                        value={nieuweRegelDraft.kunstwerkId || null}
                        onChange={(value) =>
                          setNieuweRegelDraft((current) => ({
                            ...current,
                            kunstwerkId: value ?? '',
                            materiaalId: '',
                            maatId: '',
                          }))
                        }
                        placeholder={t('bestellingenRegelKunstwerkPlaceholder')}
                        noResultsLabel={t('bestellingenRegelKunstwerkGeenResultaten')}
                        testId="bestelling-modal-nieuwe-regel-kunstwerk"
                      />
                    </Veld>
                    {(() => {
                      const gekozenKunstwerk = (kunstwerken ?? []).find((k) => k.id === nieuweRegelDraft.kunstwerkId);
                      if (!gekozenKunstwerk) return null;
                      const beschikbareMaterialen = (materialen ?? []).filter((m) =>
                        gekozenKunstwerk.materiaalIds.includes(m.id)
                      );
                      const beschikbareMaten = (maten ?? []).filter((m) => gekozenKunstwerk.maatIds.includes(m.id));
                      return (
                        <>
                          <Veld label={t('bestellingenModalLabelMateriaal')}>
                            <select
                              value={nieuweRegelDraft.materiaalId}
                              onChange={(event) =>
                                setNieuweRegelDraft((current) => ({ ...current, materiaalId: event.target.value }))
                              }
                              data-testid="bestelling-modal-nieuwe-regel-materiaal"
                              className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                            >
                              <option value="">—</option>
                              {beschikbareMaterialen.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.materiaaldikte}mm {materiaalsoortNaamById.get(m.materiaalsoortId) ?? m.materiaalsoortId}
                                </option>
                              ))}
                            </select>
                          </Veld>
                          {gekozenKunstwerk.maatIds.length === 0 ? (
                            <div className="flex gap-2">
                              <Veld label={t('matenLabelBreedte')}>
                                <input
                                  type="number"
                                  value={nieuweRegelDraft.breedte}
                                  onChange={(event) =>
                                    setNieuweRegelDraft((current) => ({ ...current, breedte: event.target.value }))
                                  }
                                  data-testid="bestelling-modal-nieuwe-regel-breedte"
                                  className={`w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                                />
                              </Veld>
                              <Veld label={t('matenLabelHoogte')}>
                                <input
                                  type="number"
                                  value={nieuweRegelDraft.hoogte}
                                  onChange={(event) =>
                                    setNieuweRegelDraft((current) => ({ ...current, hoogte: event.target.value }))
                                  }
                                  data-testid="bestelling-modal-nieuwe-regel-hoogte"
                                  className={`w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                                />
                              </Veld>
                            </div>
                          ) : (
                            <Veld label={t('bestellingenModalLabelMaat')}>
                              <select
                                value={nieuweRegelDraft.maatId}
                                onChange={(event) =>
                                  setNieuweRegelDraft((current) => ({ ...current, maatId: event.target.value }))
                                }
                                data-testid="bestelling-modal-nieuwe-regel-maat"
                                className="rounded-sm bg-black/40 px-2 py-1.5 text-xs text-white"
                              >
                                <option value="">—</option>
                                {beschikbareMaten.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.breedte}×{m.hoogte} cm
                                  </option>
                                ))}
                              </select>
                            </Veld>
                          )}
                        </>
                      );
                    })()}
                    <Veld label={t('bestellingenModalLabelAantal')}>
                      <input
                        type="number"
                        min={1}
                        value={nieuweRegelDraft.quantity}
                        onChange={(event) =>
                          setNieuweRegelDraft((current) => ({ ...current, quantity: event.target.value }))
                        }
                        data-testid="bestelling-modal-nieuwe-regel-aantal"
                        className={`w-16 rounded-sm bg-black/40 px-2 py-1 text-xs text-white ${GEEN_SPINNER}`}
                      />
                    </Veld>
                    {nieuweRegelPrijsvoorbeeld && (
                      <p data-testid="bestelling-modal-nieuwe-regel-prijsvoorbeeld" className="text-xs text-white/60">
                        {nieuweRegelPrijsvoorbeeld.status === 'laden'
                          ? '…'
                          : nieuweRegelPrijsvoorbeeld.status === 'vast'
                            ? `${nieuweRegelAantal || 1} × ${formatCurrency(nieuweRegelPrijsvoorbeeld.prijs)} = ${formatCurrency(
                                nieuweRegelPrijsvoorbeeld.prijs * (nieuweRegelAantal || 1)
                              )}`
                            : t('bestellingenModalPrijsOpAanvraag')}
                      </p>
                    )}
                    {nieuweRegelError && (
                      <p data-testid="bestelling-modal-nieuwe-regel-fout" className="text-xs text-red-400">
                        {nieuweRegelError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleNieuweRegelToevoegen}
                        data-testid="bestelling-modal-nieuwe-regel-toevoegen-bevestigen"
                        className="btn-beheer-primary rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink"
                      >
                        {t('bestellingenModalRegelOpslaan')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setToonNieuweRegel(false);
                          setNieuweRegelError(null);
                        }}
                        data-testid="bestelling-modal-nieuwe-regel-annuleren"
                        className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                      >
                        {t('annuleren')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setToonNieuweRegel(true)}
                    data-testid="bestelling-modal-regel-toevoegen"
                    className="self-start text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                  >
                    {t('bestellingenRegelToevoegen')}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1 border-t border-white/10 pt-3 text-xs">
              <span className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('bestellingenHistorieTitel')}</span>
              <ul data-testid="bestelling-modal-historie" className="flex flex-col gap-0.5">
                {(historie ?? []).map((entry, index) => (
                  <li
                    key={index}
                    data-testid={`bestelling-modal-historie-item-${index}`}
                    className="flex justify-between gap-3 text-white/60"
                  >
                    <span>
                      {HISTORIE_LABEL_KEY[entry.status] ? t(HISTORIE_LABEL_KEY[entry.status]) : entry.status}
                    </span>
                    <span>{entry.tijdstip.toLocaleString('nl-NL')}</span>
                  </li>
                ))}
              </ul>
            </div>

            {heeftOngeprijsdeRegel && (
              <p data-testid="bestelling-modal-goedkeuren-blocked" className="text-xs text-amber-400">
                {t('bestellingenGoedkeurenBlocked')}
              </p>
            )}

            {heeftConceptWijziging && (
              <div className="flex justify-end border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={handleWijzigingenOpslaan}
                  disabled={saving}
                  data-testid="bestelling-modal-wijzigingen-opslaan"
                  className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
                >
                  {t('bestellingenWijzigingenOpslaan')}
                </button>
              </div>
            )}

            {toonMailVraag && (
              <div
                data-testid="bestelling-modal-mail-vraag"
                className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs"
              >
                <span>{t('bestellingenMailVraag')}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleMailJa}
                    data-testid="bestelling-modal-mail-ja"
                    className="btn-beheer-primary rounded-sm bg-silver px-3 py-1.5 text-xs tracking-wide text-ink"
                  >
                    {t('bestellingenMailJa')}
                  </button>
                  <button
                    type="button"
                    onClick={handleMailNee}
                    data-testid="bestelling-modal-mail-nee"
                    className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-1.5 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
                  >
                    {t('bestellingenMailNee')}
                  </button>
                </div>
              </div>
            )}
          </div>
          {bevestigingAfwijzen.open && (
            <AfwijzenBevestigingTekst
              item={bestelling.bestelnr}
              reden={bevestigingAfwijzen.reden}
              onWijzigReden={bevestigingAfwijzen.wijzigReden}
              testId="bestelling-modal-afwijzen-bevestiging"
            />
          )}
        </>
      )}
    </Modal>
  );
}
