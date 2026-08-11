import { Link } from '@/i18n/navigation';
import { DocumentatieSidebar } from './DocumentatieSidebar';
import { KlantWebsiteChapter } from './chapters/KlantWebsiteChapter';
import { KlantRegistratieChapter } from './chapters/KlantRegistratieChapter';
import { BestelprocesChapter } from './chapters/BestelprocesChapter';
import { KunstwerkenChapter } from './chapters/KunstwerkenChapter';
import { KunstenaarsChapter } from './chapters/KunstenaarsChapter';
import { PrijsmatrixChapter } from './chapters/PrijsmatrixChapter';
import { StamgegevensChapter } from './chapters/StamgegevensChapter';
import { DrukkersChapter } from './chapters/DrukkersChapter';
import { GlassartDesignChapter } from './chapters/GlassartDesignChapter';
import { InstellingenChapter } from './chapters/InstellingenChapter';

export function Documentatie() {
  return (
    <main data-testid="documentatie-page" className="min-h-screen bg-white text-ink">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pb-4 pt-8 sm:px-8">
        <h1 className="font-head text-2xl text-ink sm:text-3xl">Gebruikershandleiding beheer</h1>
        <Link href="/beheer" className="text-sm text-gold hover:text-gold-bright">
          Terug naar beheer
        </Link>
      </div>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-4 pb-24 sm:px-8 lg:grid-cols-[220px_1fr]">
        <DocumentatieSidebar />
        <div className="flex flex-col gap-10">
          <KlantWebsiteChapter />
          <KlantRegistratieChapter />
          <BestelprocesChapter />
          <KunstwerkenChapter />
          <KunstenaarsChapter />
          <PrijsmatrixChapter />
          <StamgegevensChapter />
          <DrukkersChapter />
          <GlassartDesignChapter />
          <InstellingenChapter />
        </div>
      </div>
    </main>
  );
}
