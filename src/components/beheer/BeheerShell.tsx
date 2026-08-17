'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GlassPanel } from '@/components/GlassPanel';
import { HelpLink } from '@/components/HelpLink';
import { BeheerNav, type BeheerSection } from './BeheerNav';
import { KlantenSection, type Klant } from './KlantenSection';
import { BestellingenSection, type Bestelling, type BestellingLine } from './BestellingenSection';
import { MateriaalsoortenSection } from './MateriaalsoortenSection';
import { MaterialenSection } from './MaterialenSection';
import { MatenSection } from './MatenSection';
import { SegmentenSection } from './SegmentenSection';
import { StijlenSection } from './StijlenSection';
import { CategorieenSection } from './CategorieenSection';
import { KunstwerkenSection } from './KunstwerkenSection';
import { PrijsgroepenSection } from './PrijsgroepenSection';
import { KunstenaarsSection } from './KunstenaarsSection';
import { DrukkersSection } from './DrukkersSection';
import { ActiviteitSection, type Activiteit } from './ActiviteitSection';
import { GlassartDesignSection } from './GlassartDesignSection';
import { InstellingenSection } from './InstellingenSection';
import { PrijsmatrixSection } from './PrijsmatrixSection';
import type { Materiaalsoort, Materiaal, Maat, Segment, Stijl, Categorie, Kunstwerk, Prijsgroep, Drukker } from './materiaalTypes';
import type { Kunstenaar } from './kunstenaarTypes';
import type { Bedrijfsgegevens } from './bedrijfsgegevensTypes';
import type { Bestelinstellingen } from './bestelinstellingenTypes';
import type { BtwTarieven } from './btwTarievenTypes';
import type { ActiviteitType } from '@/lib/logActiviteit';
import { useApiCollection } from '@/lib/useApiCollection';
import { useApiRecord } from '@/lib/useApiRecord';

interface BeheerShellProps {
  email: string;
  onLogout: () => void;
}

type RawBestelling = Omit<Bestelling, 'companyName'>;

interface PrijsmatrixRegel {
  maatId: string;
  materiaalId: string;
  prijs: number | null;
}

const SECTION_ANCHORS: Record<BeheerSection, string> = {
  klanten: 'klant-registratie',
  bestellingen: 'bestelproces',
  materiaalsoorten: 'stamgegevens-materiaalsoorten',
  materialen: 'stamgegevens-materialen',
  maten: 'stamgegevens-maten',
  segmenten: 'stamgegevens-segmenten',
  stijlen: 'stamgegevens-stijlen',
  categorieen: 'stamgegevens-categorieen',
  kunstwerken: 'kunstwerken',
  kunstenaars: 'kunstenaars',
  prijsgroepen: 'stamgegevens-prijsgroepen',
  prijsmatrix: 'prijsmatrix',
  drukkers: 'drukkers',
  activiteit: 'stamgegevens-activiteit',
  glassartDesign: 'glassart-design',
  instellingen: 'instellingen',
};

export function BeheerShell({ email, onLogout }: BeheerShellProps) {
  const t = useTranslations('beheer');
  const [activeSection, setActiveSection] = useState<BeheerSection>('klanten');
  const [klanten, setKlanten] = useState<Klant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rawBestellingen, setRawBestellingen] = useState<RawBestelling[] | null>(null);
  const [bestellingenLoadError, setBestellingenLoadError] = useState<string | null>(null);
  const [activiteiten, setActiviteiten] = useState<Activiteit[] | null>(null);
  const [activiteitenLoadError, setActiviteitenLoadError] = useState<string | null>(null);
  const [prijsmatrix, setPrijsmatrix] = useState<PrijsmatrixRegel[] | null>(null);
  const [prijsmatrixLoadError, setPrijsmatrixLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadKlanten() {
      try {
        const response = await fetch('/api/klanten');
        if (!response.ok) throw new Error('load failed');
        const rows = (await response.json()) as Klant[];
        if (!cancelled) {
          setKlanten(rows);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setLoadError(t('klantenLoadError'));
        }
      }
    }
    loadKlanten();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadBestellingen() {
      try {
        const response = await fetch('/api/bestelheaders');
        if (!response.ok) throw new Error('load failed');
        const headers = (await response.json()) as Array<{
          id: string;
          klantnr: string;
          bestelnr: string;
          zendingnummer?: string | null;
          korting: number | null;
          besteldatum: string;
          status: string;
          lines: BestellingLine[];
        }>;
        if (!cancelled) {
          setRawBestellingen(
            headers.map((header) => ({
              id: header.id,
              klantnr: header.klantnr,
              bestelnr: header.bestelnr ?? header.id,
              zendingnummer: header.zendingnummer ?? null,
              korting: header.korting ?? null,
              besteldatum: new Date(header.besteldatum).toLocaleDateString('nl-NL'),
              status: header.status,
              lineCount: header.lines.length,
              totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
              lines: header.lines,
            })) as RawBestelling[]
          );
          setBestellingenLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setBestellingenLoadError(t('bestellingenLoadError'));
        }
      }
    }
    loadBestellingen();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadActiviteiten() {
      try {
        const response = await fetch('/api/activiteitenlog');
        if (!response.ok) throw new Error('load failed');
        const rows = (await response.json()) as Array<{
          id: string;
          type: ActiviteitType;
          actorEmail: string;
          actorNaam: string;
          omschrijving?: string;
          timestamp: string;
        }>;
        if (!cancelled) {
          setActiviteiten(
            rows.map((row) => ({
              id: row.id,
              type: row.type,
              actorEmail: row.actorEmail,
              actorNaam: row.actorNaam,
              omschrijving: row.omschrijving,
              timestamp: row.timestamp ? new Date(row.timestamp) : null,
            }))
          );
          setActiviteitenLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setActiviteitenLoadError(t('activiteitLoadError'));
        }
      }
    }
    loadActiviteiten();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function loadPrijsmatrix() {
      try {
        const response = await fetch('/api/prijsmatrix');
        if (!response.ok) throw new Error('load failed');
        const body = (await response.json()) as { prijzen: PrijsmatrixRegel[] };
        if (!cancelled) {
          setPrijsmatrix(body.prijzen);
          setPrijsmatrixLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setPrijsmatrixLoadError(t('prijsmatrixLoadError'));
        }
      }
    }
    loadPrijsmatrix();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function handlePrijsmatrixRegelUpdated(maatId: string, materiaalId: string, prijs: number | null) {
    setPrijsmatrix((current) =>
      (current ?? []).map((regel) =>
        regel.maatId === maatId && regel.materiaalId === materiaalId ? { ...regel, prijs } : regel
      )
    );
  }

  function handleKlantUpdated(updated: Klant) {
    setKlanten((current) => (current ?? []).map((klant) => (klant.id === updated.id ? updated : klant)));
  }

  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === updated.id
          ? {
              ...row,
              status: updated.status,
              zendingnummer: updated.zendingnummer ?? row.zendingnummer,
              afwijsreden: updated.afwijsreden ?? row.afwijsreden,
              korting: updated.korting,
              lines: updated.lines,
              lineCount: updated.lines.length,
              totalQuantity: updated.lines.reduce((sum, line) => sum + line.quantity, 0),
            }
          : row
      )
    );
  }

  const bestellingen = useMemo(() => {
    if (rawBestellingen === null) return null;
    return rawBestellingen.map((row) => ({
      ...row,
      companyName: (klanten ?? []).find((klant) => klant.klantnr === row.klantnr)?.companyName ?? row.klantnr,
    }));
  }, [rawBestellingen, klanten]);

  // Elke bestelling met al haar regels is hier al ingeladen, dus de codes die in een
  // bestelling voorkomen zijn gratis -- daar is geen apart endpoint voor nodig.
  const bestelCodes = useMemo(
    () => new Set((rawBestellingen ?? []).flatMap((bestelling) => bestelling.lines.map((line) => line.code))),
    [rawBestellingen]
  );

  // Nothing here is seeded: every collection and instellingen-record is real content that
  // an admin enters, so an empty environment must stay empty instead of being refilled
  // with placeholder rows behind the admin's back.
  const materiaalsoorten = useApiCollection<Materiaalsoort>('materiaalsoorten');
  const materialen = useApiCollection<Materiaal>('materialen');
  const maten = useApiCollection<Maat>('maten');
  const segmenten = useApiCollection<Segment>('segmenten');
  const stijlen = useApiCollection<Stijl>('stijlen');
  const categorieen = useApiCollection<Categorie>('categorieen');
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken');
  const prijsgroepen = useApiCollection<Prijsgroep>('prijsgroepen');
  const kunstenaars = useApiCollection<Kunstenaar>('kunstenaars');
  const drukkers = useApiCollection<Drukker>('drukkers');
  const bedrijfsgegevens = useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens');
  const bestelinstellingen = useApiRecord<Bestelinstellingen>('instellingen', 'bestelinstellingen');
  const btwtarieven = useApiRecord<BtwTarieven>('instellingen', 'btwtarieven');

  const klantenCount = (klanten ?? []).length;
  const bestellingenCount = (bestellingen ?? []).length;
  const materiaalsoortenCount = (materiaalsoorten.items ?? []).length;
  const materialenCount = (materialen.items ?? []).length;
  const matenCount = (maten.items ?? []).length;
  const segmentenCount = (segmenten.items ?? []).length;
  const stijlenCount = (stijlen.items ?? []).length;
  const categorieenCount = (categorieen.items ?? []).length;
  const kunstwerkenCount = (kunstwerken.items ?? []).length;
  const prijsgroepenCount = (prijsgroepen.items ?? []).length;
  const kunstenaarsCount = (kunstenaars.items ?? []).length;
  const drukkersCount = (drukkers.items ?? []).length;
  const activiteitCount = (activiteiten ?? []).length;

  return (
    <div
      data-testid="beheer-dashboard"
      className="mx-auto grid max-w-none grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]"
    >
      <GlassPanel className="w-full !max-w-none !px-5">
        <p data-testid="beheer-logged-in-as" className="mb-4 text-xs text-white/60">
          {t('loggedInAs', { email })}
        </p>
        <BeheerNav
          activeSection={activeSection}
          onSelect={setActiveSection}
          onLogout={onLogout}
          klantenCount={klantenCount}
          bestellingenCount={bestellingenCount}
          materiaalsoortenCount={materiaalsoortenCount}
          materialenCount={materialenCount}
          matenCount={matenCount}
          segmentenCount={segmentenCount}
          stijlenCount={stijlenCount}
          categorieenCount={categorieenCount}
          kunstwerkenCount={kunstwerkenCount}
          kunstenaarsCount={kunstenaarsCount}
          prijsgroepenCount={prijsgroepenCount}
          drukkersCount={drukkersCount}
          activiteitCount={activiteitCount}
        />
      </GlassPanel>
      <GlassPanel className="w-full !max-w-none">
        <HelpLink
          anchor={SECTION_ANCHORS[activeSection]}
          label="Open het hoofdstuk over dit onderdeel in de gebruikershandleiding"
          testId="beheer-section-help"
          className="absolute right-4 top-4 sm:right-6 sm:top-6"
        />
        <div className="pt-3">
          {activeSection === 'klanten' ? (
            <KlantenSection
              klanten={klanten}
              prijsgroepen={prijsgroepen.items}
              kunstenaars={kunstenaars.items}
              btwTarieven={btwtarieven.data}
              btwLoadError={btwtarieven.error === 'load'}
              loadError={loadError}
              onKlantUpdated={handleKlantUpdated}
            />
          ) : activeSection === 'bestellingen' ? (
            <BestellingenSection
              bestellingen={bestellingen}
              kunstwerken={kunstwerken.items}
              materialen={materialen.items}
              maten={maten.items}
              materiaalsoorten={materiaalsoorten.items}
              klanten={klanten}
              btwTarieven={btwtarieven.data}
              bestelinstellingen={bestelinstellingen.data}
              drukkers={drukkers.items}
              loadError={bestellingenLoadError}
              onBestellingUpdated={handleBestellingUpdated}
            />
          ) : activeSection === 'materiaalsoorten' ? (
            <MateriaalsoortenSection
              materiaalsoorten={materiaalsoorten.items}
              materialen={materialen.items}
              // Note: a write that succeeds but whose follow-up refetch fails also sets
              // error to 'load' (not 'action'), so it surfaces here as a full-section
              // error rather than the modal's actionError banner — treated as acceptable
              // since the shown data is now stale and worth a hard refresh anyway.
              loadError={materiaalsoorten.error === 'load' ? t('materiaalsoortenLoadError') : null}
              onAdd={materiaalsoorten.add}
              onUpdate={materiaalsoorten.update}
              onRemove={materiaalsoorten.remove}
            />
          ) : activeSection === 'materialen' ? (
            <MaterialenSection
              materialen={materialen.items}
              materiaalsoorten={materiaalsoorten.items}
              kunstwerken={kunstwerken.items}
              loadError={materialen.error === 'load' ? t('materialenLoadError') : null}
              actionErrorCode={materialen.lastMutationErrorCode}
              onAdd={materialen.add}
              onUpdate={materialen.update}
              onRemove={materialen.remove}
              onKunstwerkenChanged={() => void kunstwerken.refetch()}
            />
          ) : activeSection === 'maten' ? (
            <MatenSection
              maten={maten.items}
              kunstwerken={kunstwerken.items}
              loadError={maten.error === 'load' ? t('matenLoadError') : null}
              onAdd={maten.add}
              onUpdate={maten.update}
              onRemove={maten.remove}
            />
          ) : activeSection === 'segmenten' ? (
            <SegmentenSection
              segmenten={segmenten.items}
              kunstwerken={kunstwerken.items}
              loadError={segmenten.error === 'load' ? t('segmentenLoadError') : null}
              onAdd={segmenten.add}
              onUpdate={segmenten.update}
              onRemove={segmenten.remove}
            />
          ) : activeSection === 'stijlen' ? (
            <StijlenSection
              stijlen={stijlen.items}
              kunstwerken={kunstwerken.items}
              loadError={stijlen.error === 'load' ? t('stijlenLoadError') : null}
              onAdd={stijlen.add}
              onUpdate={stijlen.update}
              onRemove={stijlen.remove}
            />
          ) : activeSection === 'categorieen' ? (
            <CategorieenSection
              categorieen={categorieen.items}
              kunstwerken={kunstwerken.items}
              loadError={categorieen.error === 'load' ? t('categorieenLoadError') : null}
              onAdd={categorieen.add}
              onUpdate={categorieen.update}
              onRemove={categorieen.remove}
            />
          ) : activeSection === 'kunstwerken' ? (
            <KunstwerkenSection
              kunstwerken={kunstwerken.items}
              segmenten={segmenten.items}
              materialen={materialen.items}
              materiaalsoorten={materiaalsoorten.items}
              maten={maten.items}
              stijlen={stijlen.items}
              categorieen={categorieen.items}
              kunstenaars={kunstenaars.items}
              loadError={kunstwerken.error === 'load' ? t('kunstwerkenLoadError') : null}
              bestelCodes={bestelCodes}
              actionErrorCode={kunstwerken.lastMutationErrorCode}
              onAdd={kunstwerken.add}
              onUpdate={kunstwerken.update}
              onRemove={kunstwerken.remove}
              onAddSegment={segmenten.add}
              onAddStijl={stijlen.add}
              onAddCategorie={categorieen.add}
            />
          ) : activeSection === 'kunstenaars' ? (
            <KunstenaarsSection
              kunstenaars={kunstenaars.items}
              klanten={klanten}
              kunstwerken={kunstwerken.items}
              loadError={kunstenaars.error === 'load' ? t('kunstenaarsLoadError') : null}
              onUpdate={kunstenaars.update}
              onRemove={kunstenaars.remove}
              onRefetch={kunstenaars.refetch}
            />
          ) : activeSection === 'prijsgroepen' ? (
            <PrijsgroepenSection
              prijsgroepen={prijsgroepen.items}
              klanten={klanten}
              loadError={prijsgroepen.error === 'load' ? t('prijsgroepenLoadError') : null}
              onAdd={prijsgroepen.add}
              onUpdate={prijsgroepen.update}
              onRemove={prijsgroepen.remove}
            />
          ) : activeSection === 'prijsmatrix' ? (
            <PrijsmatrixSection
              prijsmatrix={prijsmatrix}
              maten={maten.items}
              materialen={materialen.items}
              materiaalsoorten={materiaalsoorten.items}
              loadError={prijsmatrixLoadError}
              onRegelUpdated={handlePrijsmatrixRegelUpdated}
            />
          ) : activeSection === 'drukkers' ? (
            <DrukkersSection
              drukkers={drukkers.items}
              bestellingen={bestellingen}
              kunstwerken={kunstwerken.items}
              materialen={materialen.items}
              maten={maten.items}
              materiaalsoorten={materiaalsoorten.items}
              klanten={klanten}
              loadError={drukkers.error === 'load' ? t('drukkersLoadError') : null}
              // drukkernr is server-eigendom (zie POST /api/drukkers); de meegegeven lege
              // waarde wordt daar sowieso genegeerd, dit dient alleen om aan
              // Omit<Drukker, 'id'> van useApiCollection's add te voldoen. update() accepteert
              // al een Partial, dus die kan zonder wrapper doorgegeven worden.
              onAdd={(data) => drukkers.add({ ...data, drukkernr: '' })}
              onUpdate={drukkers.update}
              onRemove={drukkers.remove}
              onBestellingUpdated={handleBestellingUpdated}
            />
          ) : activeSection === 'glassartDesign' ? (
            <GlassartDesignSection
              bedrijfsgegevens={bedrijfsgegevens.data}
              loadError={bedrijfsgegevens.error === 'load' ? t('glassartDesignLoadError') : null}
              onSave={bedrijfsgegevens.save}
            />
          ) : activeSection === 'instellingen' ? (
            <InstellingenSection
              bestelinstellingen={bestelinstellingen.data}
              loadError={bestelinstellingen.error === 'load' ? t('instellingenLoadError') : null}
              onSave={bestelinstellingen.save}
              btwTarieven={btwtarieven.data}
              btwLoadError={btwtarieven.error === 'load' ? t('instellingenLoadError') : null}
              onSaveBtw={btwtarieven.save}
            />
          ) : (
            <ActiviteitSection activiteiten={activiteiten} loadError={activiteitenLoadError} />
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
