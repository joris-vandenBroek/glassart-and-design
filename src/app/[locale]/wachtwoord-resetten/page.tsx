import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';

export default async function WachtwoordResettenPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  const t = await getTranslations('resetPasswordPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-lg text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
      </GlassPanel>

      <GlassPanel className="mx-auto !max-w-lg">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </GlassPanel>
    </main>
  );
}
