import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export function generateStaticParams() {
  return [{ locale: 'nl' }];
}

export const dynamicParams = false;

export default async function BeheerPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.beheer) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('beheer');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-6 !max-w-none !py-5 text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
      </GlassPanel>

      <AdminDashboard />
    </main>
  );
}
