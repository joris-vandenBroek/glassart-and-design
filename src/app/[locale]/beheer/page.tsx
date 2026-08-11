import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import { AppVersionLabel } from '@/components/AppVersionLabel';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';
import { Link } from '@/i18n/navigation';
import { HelpLink } from '@/components/HelpLink';

export function generateStaticParams() {
  return [{ locale: 'nl' }];
}

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
      <GlassPanel className="relative mx-auto mb-6 !max-w-none !py-5 text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <AppVersionLabel />
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-4 sm:right-6">
          <HelpLink label="Open de gebruikershandleiding" testId="beheer-help" />
          <Link href="/" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white">
            {t('naarWebsiteLink')}
          </Link>
        </div>
      </GlassPanel>

      <AdminDashboard />
    </main>
  );
}
