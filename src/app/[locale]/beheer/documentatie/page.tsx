import { setRequestLocale } from 'next-intl/server';
import { DocumentatieGate } from '@/components/beheer/documentatie/DocumentatieGate';

export function generateStaticParams() {
  return [{ locale: 'nl' }];
}

export default async function BeheerDocumentatiePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  setRequestLocale(locale);

  return <DocumentatieGate />;
}
