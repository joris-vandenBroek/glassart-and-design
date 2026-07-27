'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import type { Bestelinstellingen } from './bestelinstellingenTypes';

interface InstellingenSectionProps {
  bestelinstellingen: Bestelinstellingen | null;
  loadError: string | null;
  onSave: (data: Bestelinstellingen) => Promise<boolean>;
}

export function InstellingenSection({ bestelinstellingen, loadError, onSave }: InstellingenSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [form, setForm] = useState<Bestelinstellingen | null>(bestelinstellingen);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setForm(bestelinstellingen);
  }, [bestelinstellingen]);

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

  async function handleSave() {
    if (!form) return;
    setActionError(null);
    const clamped = { minimaleAfname: Math.max(1, Math.round(form.minimaleAfname) || 1) };
    const success = await onSave(clamped);
    if (success) {
      setForm(clamped);
      void logActiviteit('bestelinstellingen_gewijzigd', actorFromMedewerker(user));
    } else {
      setActionError(t('instellingenActionError'));
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
