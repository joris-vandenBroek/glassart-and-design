import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ProductsGrid } from '@/components/ProductsGrid';
import { BecomeClientCta } from '@/components/BecomeClientCta';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function CollectiesPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.collecties) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('collectionsPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-5xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <Suspense fallback={null}>
        <ProductsGrid />
      </Suspense>

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <BecomeClientCta />
      </div>
    </main>
  );
}
