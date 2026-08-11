'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import { useAfwijzenBevestiging, AfwijzenBevestigingTekst, AfwijzenBevestigingActies } from './afwijzenBevestiging';
import { useBestellingHistorie } from '@/lib/useBestellingHistorie';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';
import { ProductImage } from '@/components/ProductImage';
import type { Bestelling, BestellingLine } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';

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

interface BestellingModalProps {
  bestelling: Bestelling | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
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
      bevestigingAfwijzen.annuleer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestelling?.id]);

  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijvingNl])
  );

  const klant = bestelling ? (klanten ?? []).find((k) => k.klantnr === bestelling.klantnr) : undefined;
  const land = klant ? klant.invoiceLand || klant.land || null : null;
  const klantBtwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
  const totalen = bestelling
    ? berekenBestellingTotalen(bestelling.lines, bestelling.korting, klantBtwPercentage)
    : null;
  const heeftOngeprijsdeRegel = totalen?.heeftOngeprijsdeRegel ?? false;
  const totaalWeergave =
    bestelling && bestelling.lines.length > 0
      ? heeftOngeprijsdeRegel
        ? t('bestellingenModalTotalIncomplete')
        : formatCurrency(totalen!.totaalExclBtw!)
      : null;
  const btwPercentage = totalen?.btwPercentage ?? null;
  const btwBedrag = totalen?.btwBedrag ?? null;
  const totaalInclBtw = totalen?.totaalInclBtw ?? null;

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
    const quantity = Number(lineDraft.quantity);
    if (!lineDraft.materiaalId || !quantity || quantity <= 0) return;
    const prijs = lineDraft.prijs === '' ? null : Number(lineDraft.prijs);
    if (prijs !== null && prijs <= 0) return;

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

  const heeftConceptWijziging = Object.keys(conceptUpdates).length > 0;

  async function handleWijzigingenOpslaan() {
    if (!bestelling) return;
    setSaving(true);
    setError(null);
    try {
      const updates = Object.entries(conceptUpdates).map(([id, patch]) => ({ id, ...patch }));
      const response = await fetch(`/api/bestelheaders/${bestelling.id}/wijzigen`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ korting: bestelling.korting, updates, additions: [], deletions: [] }),
      });
      if (!response.ok) throw new Error('wijzigen failed');
      const body = (await response.json()) as { lines: BestellingLine[]; korting: number | null };
      void logActiviteit('bestelling_gewijzigd', bestelling.bestelnr);
      onBestellingGewijzigd({ ...bestelling, lines: body.lines, korting: body.korting });
      setConceptUpdates({});
    } catch {
      setError(t('bestellingenActionError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={bestelling !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={t('bestellingenModalTitel')}
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
                <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                  {t('bestellingenModalTotalLabel')}
                </span>
                <span
                  data-testid="bestelling-modal-total"
                  className="text-right text-sm font-semibold text-white tabular-nums"
                >
                  {totaalWeergave}
                </span>
                {totalen && totalen.korting > 0 && (
                  <div data-testid="bestelling-modal-korting" className="contents">
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('bestellingenModalKortingLabel')}
                    </span>
                    <span className="text-right text-sm text-white/80 tabular-nums">
                      -{formatCurrency(totalen.korting)}
                    </span>
                  </div>
                )}
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
                    : weergaveLine.maatId;
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
                                  : weergaveLine.materiaalId}
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
                          {kunstwerk && (
                            <button
                              type="button"
                              onClick={() => startEditRegel(weergaveLine)}
                              data-testid={`bestelling-modal-regel-bewerken-${line.id}`}
                              className="mt-1.5 text-[0.65rem] uppercase tracking-wide text-white/40 underline underline-offset-2 hover:text-white/70"
                            >
                              {t('bewerken')}
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="mt-1.5 flex flex-col gap-2">
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

                          {isCustomLine(line) ? (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={lineDraft?.breedte ?? ''}
                                onChange={(event) =>
                                  setLineDraft((current) =>
                                    current ? { ...current, breedte: event.target.value } : current
                                  )
                                }
                                data-testid={`bestelling-modal-regel-breedte-${line.id}`}
                                className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                              />
                              <input
                                type="number"
                                value={lineDraft?.hoogte ?? ''}
                                onChange={(event) =>
                                  setLineDraft((current) =>
                                    current ? { ...current, hoogte: event.target.value } : current
                                  )
                                }
                                data-testid={`bestelling-modal-regel-hoogte-${line.id}`}
                                className="w-20 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                              />
                            </div>
                          ) : (
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
                          )}

                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder={t('bestellingenModalLabelPrijs')}
                              value={lineDraft?.prijs ?? ''}
                              onChange={(event) =>
                                setLineDraft((current) =>
                                  current ? { ...current, prijs: event.target.value } : current
                                )
                              }
                              data-testid={`bestelling-modal-regel-prijs-${line.id}`}
                              className="w-24 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                            />
                            <input
                              type="number"
                              min={1}
                              placeholder={t('bestellingenModalLabelAantal')}
                              value={lineDraft?.quantity ?? ''}
                              onChange={(event) =>
                                setLineDraft((current) =>
                                  current ? { ...current, quantity: event.target.value } : current
                                )
                              }
                              data-testid={`bestelling-modal-regel-aantal-${line.id}`}
                              className="w-16 rounded-sm bg-black/40 px-2 py-1 text-xs text-white"
                            />
                          </div>

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
