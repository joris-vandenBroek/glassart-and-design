import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { CustomerLoginForm } from '@/components/CustomerLoginForm';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function InloggenPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.inloggen) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('loginPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-lg text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
      </GlassPanel>

      <GlassPanel className="mx-auto !max-w-lg">
        <CustomerLoginForm />
      </GlassPanel>
    </main>
  );
}
