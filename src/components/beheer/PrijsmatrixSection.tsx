'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
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

  const soortNaamById = useMemo(() => {
    const map = new Map<string, string>();
    (materiaalsoorten ?? []).forEach((soort) => map.set(soort.id, soort.omschrijving));
    return map;
  }, [materiaalsoorten]);

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

  function huidigeWaarde(maatId: string, materiaalId: string): string {
    const bewerkt = inputWaarden[key(maatId, materiaalId)];
    if (bewerkt !== undefined) return bewerkt;
    const regel = prijsmatrix!.find((r) => r.maatId === maatId && r.materiaalId === materiaalId);
    return regel?.prijs != null ? String(regel.prijs) : '';
  }

  async function handleBlur(maatId: string, materiaalId: string) {
    const raw = huidigeWaarde(maatId, materiaalId);
    const prijs = raw === '' ? null : Number(raw);
    try {
      const response = await fetch('/api/prijsmatrix', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maatId, materiaalId, prijs }),
      });
      if (!response.ok) throw new Error('save failed');
      onRegelUpdated(maatId, materiaalId, prijs);
      const materiaalNaam = materialen!.find((m) => m.id === materiaalId)?.omschrijving ?? materiaalId;
      const maat = maten!.find((m) => m.id === maatId);
      void logActiviteit(
        'prijsmatrix_gewijzigd',
        actorFromMedewerker(user),
        maat ? `${maat.breedte}×${maat.hoogte} — ${materiaalNaam}` : materiaalNaam
      );
      setActionError(null);
    } catch {
      setActionError(t('prijsmatrixActionError'));
    }
  }

  return (
    <div data-testid="prijsmatrix-section">
      <p className="mb-3 text-xs uppercase tracking-wide text-white/60">{t('prijsmatrixTitle')}</p>
      <table className="border-collapse text-sm text-white/80">
        <thead>
          <tr>
            <th className="border border-white/10 px-2 py-1"></th>
            {materialen.map((materiaal) => (
              <th key={materiaal.id} className="border border-white/10 px-2 py-1 text-xs font-semibold">
                {`${materiaal.materiaaldikte}mm ${soortNaamById.get(materiaal.materiaalsoortId) ?? ''}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {maten.map((maat) => (
            <tr key={maat.id}>
              <td className="border border-white/10 px-2 py-1 text-xs whitespace-nowrap">
                {`${maat.breedte}×${maat.hoogte}`}
              </td>
              {materialen.map((materiaal) => (
                <td key={materiaal.id} className="border border-white/10 px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-white/50">€</span>
                    <input
                      type="number"
                      value={huidigeWaarde(maat.id, materiaal.id)}
                      onChange={(event) =>
                        setInputWaarden((current) => ({
                          ...current,
                          [key(maat.id, materiaal.id)]: event.target.value,
                        }))
                      }
                      onBlur={() => handleBlur(maat.id, materiaal.id)}
                      data-testid={`prijsmatrix-cel-${maat.id}-${materiaal.id}`}
                      className="w-20 rounded-sm border border-transparent bg-black/40 px-2 py-1 text-sm text-white"
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs normal-case tracking-normal text-white/50">{t('prijsmatrixHint')}</p>
      {actionError && (
        <p data-testid="prijsmatrix-action-error" className="mt-2 text-xs text-red-400">
          {actionError}
        </p>
      )}
    </div>
  );
}
