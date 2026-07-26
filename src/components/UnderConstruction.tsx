import { getTranslations } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { Link } from '@/i18n/navigation';

export async function UnderConstruction() {
  const t = await getTranslations('underConstruction');

  return (
    <main
      data-testid="under-construction"
      className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-ink via-charcoal to-graphite px-4 py-24 sm:px-8"
    >
      <GlassPanel className="!max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-gold/60">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-gold"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M12 3L21 12L12 21L3 12L12 3Z" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="font-head text-xs uppercase tracking-[0.3em] text-white/50">{t('eyebrow')}</p>
        <h1 className="mt-3 text-2xl font-light text-white sm:text-3xl">{t('heading')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('text')}</p>
        <div className="mx-auto my-6 h-px w-8 bg-gold/60" />
        <Link
          href="/"
          className="text-xs font-head uppercase tracking-[0.15em] text-gold hover:text-gold-bright"
        >
          {t('backHome')}
        </Link>
      </GlassPanel>
    </main>
  );
}
