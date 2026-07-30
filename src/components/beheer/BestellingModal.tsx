'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { formatCurrency } from '@/lib/formatCurrency';
import type { Bestelling, BestellingLine } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';

const STATUS_BADGE_CLASS: Record<Bestelling['status'], string> = {
  'Te beoordelen': 'bg-amber-400/10 text-amber-300',
  'Te versturen naar drukker': 'bg-sky-400/10 text-sky-300',
  'Verstuurd naar drukker': 'bg-green-500/10 text-green-400',
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

interface BestellingModalProps {
  bestelling: Bestelling | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  onClose: () => void;
  onUpdated: (bestelling: Bestelling) => void;
  onLinePrijsVastgesteld: (bestellingId: string, lineId: string, prijs: number) => void;
  onLineUpdated: (bestellingId: string, lineId: string, updates: Partial<BestellingLine>) => void;
}

function isCustomLine(line: BestellingLine): boolean {
  return !line.maatId;
}

export function BestellingModal({
  bestelling,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  onClose,
  onUpdated,
  onLinePrijsVastgesteld,
  onLineUpdated,
}: BestellingModalProps) {
  const t = useTranslations('beheer');
  const [error, setError] = useState<string | null>(null);
  const [prijsDrafts, setPrijsDrafts] = useState<Record<string, string>>({});
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<LineDraft | null>(null);
  const { user } = useAdminAuth();

  useEffect(() => {
    if (bestelling) {
      setError(null);
      setPrijsDrafts({});
      setEditingLineId(null);
      setLineDraft(null);
    }
  }, [bestelling?.id]);

  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijving])
  );

  const heeftOngeprijsdeRegel = (bestelling?.lines ?? []).some((line) => line.prijs === null);

  async function handleGoedkeuren() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Te versturen naar drukker' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_goedgekeurd', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Te versturen naar drukker' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handleAfwijzen() {
    if (!bestelling) return;
    try {
      const response = await fetch(`/api/bestelheaders/${bestelling.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Afgewezen' }),
      });
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_afgewezen', actorFromMedewerker(user), bestelling.bestelnr);
      onUpdated({ ...bestelling, status: 'Afgewezen' });
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  async function handlePrijsVaststellen(line: BestellingLine) {
    if (!bestelling) return;
    const prijs = Number(prijsDrafts[line.id]);
    if (!prijs || prijs <= 0) return;
    try {
      const response = await fetch(
        `/api/bestelheaders/${bestelling.id}/bestellines/${line.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prijs }),
        }
      );
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_prijs_vastgesteld', actorFromMedewerker(user), bestelling.bestelnr);
      onLinePrijsVastgesteld(bestelling.id, line.id, prijs);
    } catch {
      setError(t('bestellingenActionError'));
    }
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

  async function handleOpslaanRegel(line: BestellingLine) {
    if (!bestelling || !lineDraft) return;
    const quantity = Number(lineDraft.quantity);
    if (!lineDraft.materiaalId || !quantity || quantity <= 0) return;
    const prijs = lineDraft.prijs === '' ? null : Number(lineDraft.prijs);
    if (prijs !== null && prijs <= 0) return;

    const payload: Record<string, unknown> = { materiaalId: lineDraft.materiaalId, prijs, quantity };
    const updates: Partial<BestellingLine> = { materiaalId: lineDraft.materiaalId, prijs, quantity };

    if (isCustomLine(line)) {
      const breedte = Number(lineDraft.breedte);
      const hoogte = Number(lineDraft.hoogte);
      if (!breedte || breedte <= 0 || !hoogte || hoogte <= 0) return;
      payload.maatId = '';
      payload.breedte = breedte;
      payload.hoogte = hoogte;
      updates.maatId = '';
      updates.breedte = breedte;
      updates.hoogte = hoogte;
    } else {
      if (!lineDraft.maatId) return;
      payload.maatId = lineDraft.maatId;
      updates.maatId = lineDraft.maatId;
    }

    try {
      const response = await fetch(
        `/api/bestelheaders/${bestelling.id}/bestellines/${line.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) throw new Error('update failed');
      void logActiviteit('bestelling_regel_gewijzigd', actorFromMedewerker(user), bestelling.bestelnr);
      onLineUpdated(bestelling.id, line.id, updates);
      cancelEditRegel();
    } catch {
      setError(t('bestellingenActionError'));
    }
  }

  return (
    <Modal
      isOpen={bestelling !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={t('bestellingenModalTitel')}
      subtitle={bestelling ? `${bestelling.companyName} · ${bestelling.besteldatum}` : undefined}
      footerActions={
        bestelling ? (
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
              onClick={handleAfwijzen}
              data-testid="bestelling-modal-afwijzen"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('bestellingenAfwijzen')}
            </button>
          </>
        ) : null
      }
    >
      {bestelling && (
        <div data-testid="bestelling-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <span
            data-testid="bestelling-modal-status"
            className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${STATUS_BADGE_CLASS[bestelling.status]}`}
          >
            {bestelling.status}
          </span>

          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto text-xs">
            {bestelling.lines.map((line) => {
              const kunstwerk = (kunstwerken ?? []).find((k) => k.id === line.kunstwerkId) ?? null;
              const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
              const maat = (maten ?? []).find((m) => m.id === line.maatId);
              const maatWeergave = maat
                ? `${maat.breedte}×${maat.hoogte} cm`
                : line.breedte != null && line.hoogte != null
                  ? `${line.breedte}×${line.hoogte} cm`
                  : line.maatId;
              const isEditingLine = editingLineId === line.id;
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
                  className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 last:border-0"
                >
                  <div className="flex items-start gap-3">
                    {kunstwerk ? (
                      <img
                        src={kunstwerk.foto}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                        ?
                      </div>
                    )}
                    <div>
                      <p className="text-white/90">
                        {kunstwerk ? kunstwerk.omschrijvingNl : t('bestellingenRegelOnbekend')}
                      </p>

                      {!isEditingLine ? (
                        <>
                          {kunstwerk && (
                            <>
                              <p className="text-white/50">
                                <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}: </span>
                                {materiaal
                                  ? `${materiaal.materiaaldikte}mm ${
                                      materiaalsoortNaamById.get(materiaal.materiaalsoortId) ??
                                      materiaal.materiaalsoortId
                                    } — ${materiaal.omschrijving}`
                                  : line.materiaalId}
                              </p>
                              <p className="text-white/50">
                                <span className="text-white/35">{t('bestellingenModalLabelMaat')}: </span>
                                {maatWeergave}
                              </p>
                            </>
                          )}
                          <p className="text-white/50">
                            <span className="text-white/35">{t('bestellingenModalLabelPrijs')}: </span>
                            {line.prijs !== null ? formatCurrency(line.prijs) : t('bestellingenModalPrijsOpAanvraag')}
                          </p>
                          {line.prijs === null && (
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
                              onClick={() => startEditRegel(line)}
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
                  </div>
                  <p className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-right text-white/70">
                    ×{line.quantity}
                  </p>
                </li>
              );
            })}
          </ul>

          {error && (
            <p data-testid="bestelling-modal-error" className="text-xs text-red-400">
              {error}
            </p>
          )}

          {heeftOngeprijsdeRegel && (
            <p data-testid="bestelling-modal-goedkeuren-blocked" className="text-xs text-amber-400">
              {t('bestellingenGoedkeurenBlocked')}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
