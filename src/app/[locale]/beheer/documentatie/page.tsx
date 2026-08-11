import { setRequestLocale } from 'next-intl/server';
import { DocumentatieGate } from '@/components/beheer/documentatie/DocumentatieGate';
import { pageAvailability } from '@/config/pageAvailability';
import { UnderConstruction } from '@/components/UnderConstruction';

export function generateStaticParams() {
  return [{ locale: 'nl' }];
}

export default async function BeheerDocumentatiePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  setRequestLocale(locale);

  if (!pageAvailability.beheer) {
    return <UnderConstruction />;
  }

  return <DocumentatieGate />;
}
