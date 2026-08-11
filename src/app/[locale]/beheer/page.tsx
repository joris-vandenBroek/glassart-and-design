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
      <GlassPanel className="mx-auto mb-6 !max-w-none !py-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <AppVersionLabel />
          <h1 className="order-first w-full text-center text-2xl font-light text-white sm:order-none sm:w-auto sm:flex-1 sm:text-3xl">
            {t('title')}
          </h1>
          <div className="flex items-center gap-4">
            <HelpLink label="Open de gebruikershandleiding" testId="beheer-help" />
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/60 hover:text-white"
            >
              {t('naarWebsiteLink')}
            </Link>
          </div>
        </div>
      </GlassPanel>

      <AdminDashboard />
    </main>
  );
}
