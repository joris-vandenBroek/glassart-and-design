'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { Combobox } from '@/components/Combobox';
import { LAND_OPTIONS } from '@/data/landen';
import type { Bestelinstellingen } from './bestelinstellingenTypes';
import type { BtwTarief, BtwTarieven } from './btwTarievenTypes';

// A fresh environment has no btwtarieven record yet. The form then starts out empty
// instead of with a pre-filled country, so nothing gets saved that nobody entered.
const LEGE_BTW_TARIEVEN: BtwTarieven = { tarieven: [] };

interface InstellingenSectionProps {
  bestelinstellingen: Bestelinstellingen | null;
  loadError: string | null;
  onSave: (data: Bestelinstellingen) => Promise<boolean>;
  btwTarieven: BtwTarieven | null;
  btwLoadError: string | null;
  onSaveBtw: (data: BtwTarieven) => Promise<boolean>;
}

export function InstellingenSection({
  bestelinstellingen,
  loadError,
  onSave,
  btwTarieven,
  btwLoadError,
  onSaveBtw,
}: InstellingenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [form, setForm] = useState<Bestelinstellingen | null>(bestelinstellingen);
  const [btwForm, setBtwForm] = useState<BtwTarieven | null>(btwTarieven ?? LEGE_BTW_TARIEVEN);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setForm(bestelinstellingen);
  }, [bestelinstellingen]);

  useEffect(() => {
    setBtwForm(btwTarieven ?? LEGE_BTW_TARIEVEN);
  }, [btwTarieven]);

  if (loadError) {
    return (
      <p data-testid="instellingen-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (form === null) {
    return null;
  }

  function updateTarief(index: number, updates: Partial<BtwTarief>) {
    setBtwForm((current) =>
      current
        ? { ...current, tarieven: current.tarieven.map((t, i) => (i === index ? { ...t, ...updates } : t)) }
        : current
    );
  }

  function addTarief() {
    setBtwForm((current) =>
      current ? { ...current, tarieven: [...current.tarieven, { land: '', percentage: 0 }] } : current
    );
  }

  function removeTarief(index: number) {
    setBtwForm((current) =>
      current ? { ...current, tarieven: current.tarieven.filter((_, i) => i !== index) } : current
    );
  }

  async function handleSave() {
    if (!form) return;
    setActionError(null);
    const clamped = { minimaleAfname: Math.max(1, Math.round(form.minimaleAfname) || 1) };

    const bestelinstellingenDirty =
      !bestelinstellingen || clamped.minimaleAfname !== bestelinstellingen.minimaleAfname;
    if (bestelinstellingenDirty) {
      const success = await onSave(clamped);
      if (!success) {
        setActionError(t('instellingenActionError'));
        return;
      }
      setForm(clamped);
      void logActiviteit('bestelinstellingen_gewijzigd', actorFromMedewerker(user));
    } else {
      setForm(clamped);
    }

    const currentBtw = btwTarieven ?? LEGE_BTW_TARIEVEN;
    const btwDirty = btwForm && JSON.stringify(btwForm) !== JSON.stringify(currentBtw);
    if (btwDirty) {
      const btwSuccess = await onSaveBtw(btwForm);
      if (!btwSuccess) {
        setActionError(t('instellingenActionError'));
        return;
      }
      void logActiviteit('btwtarieven_gewijzigd', actorFromMedewerker(user));
    }
  }

  return (
    <div data-testid="instellingen-section" className="flex flex-col gap-6 text-sm text-white/80">
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        {t('instellingenLabelMinimaleAfname')}
        <input
          type="number"
          min={1}
          value={form.minimaleAfname}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            setForm((current) =>
              current ? { ...current, minimaleAfname: Number.isFinite(parsed) ? parsed : 0 } : current
            );
          }}
          data-testid="instellingen-minimale-afname"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      {btwLoadError && (
        <p data-testid="instellingen-btw-error" className="text-xs text-red-400">
          {btwLoadError}
        </p>
      )}

      {btwForm && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-6">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('instellingenBtwTarievenTitel')}</span>

          {btwForm.tarieven.map((tarief, index) => (
            <div key={index} className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('instellingenBtwLand')}
                <Combobox
                  options={LAND_OPTIONS}
                  value={tarief.land || null}
                  onChange={(value) => updateTarief(index, { land: value ?? '' })}
                  placeholder={t('instellingenBtwLand')}
                  noResultsLabel={t('instellingenBtwLand')}
                  testId={`instellingen-btw-land-${index}`}
                />
              </label>
              <label className="flex w-28 flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
                {t('instellingenBtwPercentage')}
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={tarief.percentage}
                  onChange={(event) => updateTarief(index, { percentage: Number(event.target.value) })}
                  data-testid={`instellingen-btw-percentage-${index}`}
                  className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={() => removeTarief(index)}
                data-testid={`instellingen-btw-verwijderen-${index}`}
                className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
              >
                {t('instellingenBtwVerwijderen')}
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addTarief}
            data-testid="instellingen-btw-toevoegen"
            className="btn-beheer-secondary self-start rounded-sm border border-white/20 px-3 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {t('instellingenBtwToevoegen')}
          </button>
        </div>
      )}

      {actionError && (
        <p data-testid="instellingen-error-message" className="text-xs text-red-400">
          {actionError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        data-testid="instellingen-opslaan"
        className="self-start btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
      >
        {t('instellingenOpslaan')}
      </button>
    </div>
  );
}
