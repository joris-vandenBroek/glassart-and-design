'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useApiCollection } from '@/lib/useApiCollection';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { ProductImage } from './ProductImage';
import { GlassPanel } from './GlassPanel';
import type { Kunstwerk } from './beheer/materiaalTypes';

const FEATURED_COUNT = 3;

function pickRandom<T>(items: T[], count: number): T[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function FeaturedWorks() {
  const t = useTranslations('works');
  const locale = useLocale();
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken');

  const featured = useMemo(
    () => pickRandom(kunstwerken.items ?? [], FEATURED_COUNT),
    [kunstwerken.items]
  );

  if (kunstwerken.items === null) {
    return null;
  }

  return (
    <GlassPanel className="!max-w-5xl text-center">
      <p className="font-head text-[0.65rem] uppercase tracking-[0.25em] text-white/50">{t('label')}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {featured.map((kunstwerk) => (
          <div
            key={kunstwerk.id}
            data-testid="featured-work"
            className="aspect-square overflow-hidden rounded border border-white/10"
          >
            <ProductImage
              src={kunstwerk.foto}
              alt={resolveKunstwerkOmschrijving(kunstwerk, locale)}
              className="h-full w-full"
            />
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
