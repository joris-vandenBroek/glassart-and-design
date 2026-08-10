'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HelpHint } from '@/components/HelpHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import type { Maat, Materiaal, Materiaalsoort } from './materiaalTypes';

interface PrijsmatrixRegel {
  maatId: string;
  materiaalId: string;
  prijs: number | null;
}

interface PrijsmatrixSectionProps {
  prijsmatrix: PrijsmatrixRegel[] | null;
  maten: Maat[] | null;
  materialen: Materiaal[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  loadError: string | null;
  onRegelUpdated: (maatId: string, materiaalId: string, prijs: number | null) => void;
}

export function PrijsmatrixSection({
  prijsmatrix,
  maten,
  materialen,
  materiaalsoorten,
  loadError,
  onRegelUpdated,
}: PrijsmatrixSectionProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const [inputWaarden, setInputWaarden] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [opgeslagenCellen, setOpgeslagenCellen] = useState<Record<string, boolean>>({});
  const [gewijzigdeCellen, setGewijzigdeCellen] = useState<Record<string, { maatId: string; materiaalId: string }>>(
    {}
  );
  const [isSaving, setIsSaving] = useState(false);

  const soortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijvingNl));
    return map;
  }, [materiaalsoorten]);

  const gesorteerdeMaten = useMemo(() => {
    return [...(maten ?? [])].sort((a, b) => a.breedte - b.breedte || a.hoogte - b.hoogte);
  }, [maten]);

  const gesorteerdeMaterialen = useMemo(() => {
    return [...(materialen ?? [])].sort((a, b) => {
      const soortA = soortNaamById.get(a.materiaalsoortId) ?? a.materiaalsoortId;
      const soortB = soortNaamById.get(b.materiaalsoortId) ?? b.materiaalsoortId;
      return soortA.localeCompare(soortB) || a.materiaaldikte - b.materiaaldikte;
    });
  }, [materialen, soortNaamById]);

  if (loadError) {
    return (
      <p data-testid="prijsmatrix-error" className="text-xs text-red-400">
        {loadError}
      </p>
    );
  }

  if (prijsmatrix === null || maten === null || materialen === null) {
    return null;
  }

  function key(maatId: string, materiaalId: string) {
    return `${maatId}:${materiaalId}`;
  }

  function opgeslagenWaarde(maatId: string, materiaalId: string): string {
    const regel = prijsmatrix!.find((r) => r.maatId === maatId && r.materiaalId === materiaalId);
    return regel?.prijs != null ? String(regel.prijs) : '';
  }

  function huidigeWaarde(maatId: string, materiaalId: string): string {
    const bewerkt = inputWaarden[key(maatId, materiaalId)];
    if (bewerkt !== undefined) return bewerkt;
    return opgeslagenWaarde(maatId, materiaalId);
  }

  function handleChange(maatId: string, materiaalId: string, value: string) {
    const cellKey = key(maatId, materiaalId);
    setInputWaarden((current) => ({ ...current, [cellKey]: value }));
    setOpgeslagenCellen((current) => {
      if (!current[cellKey]) return current;
      const { [cellKey]: _verwijderd, ...rest } = current;
      return rest;
    });
    setGewijzigdeCellen((current) => {
      const isGewijzigd = value !== opgeslagenWaarde(maatId, materiaalId);
      if (isGewijzigd) {
        return { ...current, [cellKey]: { maatId, materiaalId } };
      }
      if (!current[cellKey]) return current;
      const { [cellKey]: _verwijderd, ...rest } = current;
      return rest;
    });
  }

  async function handleOpslaan() {
    if (isSaving) return;
    const gewijzigd = Object.entries(gewijzigdeCellen);
    if (gewijzigd.length === 0) return;

    setIsSaving(true);
    const regels = gewijzigd.map(([, { maatId, materiaalId }]) => {
      const raw = huidigeWaarde(maatId, materiaalId);
      return { maatId, materiaalId, prijs: raw === '' ? null : Number(raw) };
    });

    try {
      const response = await fetch('/api/prijsmatrix', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ regels }),
      });
      if (!response.ok) throw new Error('save failed');

      regels.forEach(({ maatId, materiaalId, prijs }) => {
        onRegelUpdated(maatId, materiaalId, prijs);
        const materiaalNaam = materialen!.find((m) => m.id === materiaalId)?.omschrijvingNl ?? materiaalId;
        const maat = maten!.find((m) => m.id === maatId);
        void logActiviteit(
          'prijsmatrix_gewijzigd',
          maat ? `${maat.breedte}×${maat.hoogte} — ${materiaalNaam}` : materiaalNaam
        );
      });

      setOpgeslagenCellen((current) => {
        const next = { ...current };
        gewijzigd.forEach(([cellKey]) => {
          next[cellKey] = true;
        });
        return next;
      });
      setGewijzigdeCellen((current) => {
        const next = { ...current };
        gewijzigd.forEach(([cellKey]) => {
          delete next[cellKey];
        });
        return next;
      });
      setActionError(null);
    } catch {
      setActionError(t('prijsmatrixActionError'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div data-testid="prijsmatrix-section">
      <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
        {t('prijsmatrixTitle')}
        <HelpHint text={t('prijsmatrixHelp')} testId="prijsmatrix-help" />
      </p>
      <table className="border-collapse text-sm text-white/80">
        <thead>
          <tr>
            <th className="border border-white/10 px-2 py-1"></th>
            {gesorteerdeMaterialen.map((materiaal) => (
              <th key={materiaal.id} className="border border-white/10 px-2 py-1 text-xs font-semibold">
                {`${materiaal.materiaaldikte}mm ${soortNaamById.get(materiaal.materiaalsoortId) ?? ''}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gesorteerdeMaten.map((maat) => (
            <tr key={maat.id}>
              <td className="border border-white/10 px-2 py-1 text-xs whitespace-nowrap">
                {`${maat.breedte}×${maat.hoogte}`}
              </td>
              {gesorteerdeMaterialen.map((materiaal) => (
                <td key={materiaal.id} className="border border-white/10 px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-white/50">€</span>
                    <input
                      type="number"
                      value={huidigeWaarde(maat.id, materiaal.id)}
                      onChange={(event) => handleChange(maat.id, materiaal.id, event.target.value)}
                      disabled={isSaving}
                      data-testid={`prijsmatrix-cel-${maat.id}-${materiaal.id}`}
                      className="w-20 rounded-sm border border-transparent bg-black/40 px-2 py-1 text-sm text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    {gewijzigdeCellen[key(maat.id, materiaal.id)] && (
                      <span
                        data-testid={`prijsmatrix-gewijzigd-${maat.id}-${materiaal.id}`}
                        className="text-xs text-amber-400"
                        title={t('prijsmatrixGewijzigd')}
                      >
                        ●
                      </span>
                    )}
                    {opgeslagenCellen[key(maat.id, materiaal.id)] && (
                      <span
                        data-testid={`prijsmatrix-saved-${maat.id}-${materiaal.id}`}
                        className="text-xs text-emerald-400"
                        title={t('prijsmatrixOpgeslagen')}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs normal-case tracking-normal text-white/50">{t('prijsmatrixHint')}</p>
      <button
        type="button"
        onClick={handleOpslaan}
        disabled={Object.keys(gewijzigdeCellen).length === 0 || isSaving}
        data-testid="prijsmatrix-opslaan"
        className="btn-beheer-primary mt-3 rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
      >
        {isSaving ? t('prijsmatrixOpslaanBezig') : t('prijsmatrixOpslaan')}
      </button>
      {actionError && (
        <p data-testid="prijsmatrix-action-error" className="mt-2 text-xs text-red-400">
          {actionError}
        </p>
      )}
    </div>
  );
}
