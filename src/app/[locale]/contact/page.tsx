import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ContactInfo } from '@/components/ContactInfo';
import { ContactForm } from '@/components/ContactForm';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export default async function ContactPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.contact) {
    return <UnderConstruction />;
  }

  const t = await getTranslations('contactPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-5xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2">
        <GlassPanel className="w-full">
          <ContactInfo />
        </GlassPanel>
        <GlassPanel className="w-full">
          <ContactForm />
        </GlassPanel>
      </div>
    </main>
  );
}
