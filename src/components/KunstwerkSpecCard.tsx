import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

interface KunstwerkSpecCardProps {
  fotoSlot?: ReactNode;
  code: string;
  titel: string;
  artiest?: string;
  collectieLabels: string[];
  materiaalLabel: string;
}

export function KunstwerkSpecCard({
  fotoSlot,
  code,
  titel,
  artiest,
  collectieLabels,
  materiaalLabel,
}: KunstwerkSpecCardProps) {
  const t = useTranslations('kunstwerkSpecCard');

  return (
    <div data-testid="kunstwerk-spec-card" className="overflow-hidden rounded-lg border border-white/10 bg-white text-ink">
      <div className="flex aspect-[2/3] w-full items-center justify-center bg-white p-4">{fotoSlot}</div>
      <div className="flex flex-col gap-2 px-5 py-6 text-center">
        <p data-testid="kunstwerk-spec-card-code" className="font-head text-lg font-semibold tracking-wide">
          {code || '—'}
        </p>
        {titel && (
          <h3 data-testid="kunstwerk-spec-card-titel" className="font-head italic text-ink/80">
            {titel}
          </h3>
        )}
        {artiest && (
          <p data-testid="kunstwerk-spec-card-artiest" className="text-xs text-ink/60">
            {artiest}
          </p>
        )}
        <hr className="my-2 border-gold/40" />
        <dl className="flex flex-col gap-1 text-xs text-ink/70">
          {collectieLabels.length > 0 && (
            <div data-testid="kunstwerk-spec-card-collectie" className="flex items-baseline justify-between gap-2">
              <dt className="font-semibold">{t('collectie')}</dt>
              <dd>{collectieLabels.join(', ')}</dd>
            </div>
          )}
          {materiaalLabel && (
            <div data-testid="kunstwerk-spec-card-materiaal" className="flex items-baseline justify-between gap-2">
              <dt className="font-semibold">{t('materiaal')}</dt>
              <dd>{materiaalLabel}</dd>
            </div>
          )}
        </dl>
        <hr className="my-2 border-gold/40" />
        <p className="text-sm font-bold uppercase tracking-[0.2em]">Glassart &amp; Design</p>
        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gold">{t('tagline')}</p>
      </div>
    </div>
  );
}
