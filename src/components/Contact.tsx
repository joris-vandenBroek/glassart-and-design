'use client';

import { useTranslations } from 'next-intl';
import { GlassPanel } from './GlassPanel';
import { useApiRecord } from '@/lib/useApiRecord';
import { BEDRIJFSGEGEVENS_SEED } from '@/data/bedrijfsgegevensSeed';
import type { Bedrijfsgegevens } from './beheer/bedrijfsgegevensTypes';

export function Contact() {
  const t = useTranslations('contact');
  const { data } = useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens');
  const bedrijfsgegevens = data ?? BEDRIJFSGEGEVENS_SEED;

  return (
    <GlassPanel id="contact" className="!max-w-5xl text-center">
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-white/50">
        {t('label')}
      </p>
      <p className="mt-4 text-sm text-white/80">
        <a
          href={`mailto:${bedrijfsgegevens.email}`}
          className="underline decoration-white/30"
        >
          {bedrijfsgegevens.email}
        </a>
      </p>
      <p className="mt-2 text-sm text-white/80">
        {bedrijfsgegevens.contactpersonen.map((persoon, index) => (
          <span key={persoon.id}>
            {index > 0 && <span className="mx-2 text-white/30">·</span>}
            <span>{persoon.naam}</span>{' '}
            <a href={`tel:${persoon.telefoon}`} className="underline decoration-white/30">
              {persoon.telefoon}
            </a>
          </span>
        ))}
      </p>
    </GlassPanel>
  );
}
