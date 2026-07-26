'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, deleteField, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GlassPanel } from '@/components/GlassPanel';
import { BeheerNav, type BeheerSection } from './BeheerNav';
import { KlantenSection, type Klant } from './KlantenSection';
import { BestellingenSection, type Bestelling, type BestellingLine } from './BestellingenSection';
import { MateriaalsoortenSection } from './MateriaalsoortenSection';
import { MaterialenSection } from './MaterialenSection';
import { MatenSection } from './MatenSection';
import { SegmentenSection } from './SegmentenSection';
import { KunstwerkenSection } from './KunstwerkenSection';
import { PrijsgroepenSection } from './PrijsgroepenSection';
import { KunstenaarsSection } from './KunstenaarsSection';
import { DrukkersSection } from './DrukkersSection';
import { ActiviteitSection, type Activiteit } from './ActiviteitSection';
import { GlassartDesignSection } from './GlassartDesignSection';
import { InstellingenSection } from './InstellingenSection';
import type { Materiaalsoort, Materiaal, Maat, Segment, Kunstwerk, Prijsgroep, Drukker } from './materiaalTypes';
import type { Kunstenaar, KunstenaarUpdate } from './kunstenaarTypes';
import type { Bedrijfsgegevens } from './bedrijfsgegevensTypes';
import type { Bestelinstellingen } from './bestelinstellingenTypes';
import type { ActiviteitType } from '@/lib/logActiviteit';
import { useFirestoreCollection } from '@/lib/useFirestoreCollection';
import { useFirestoreDocument } from '@/lib/useFirestoreDocument';
import { MATERIAALSOORTEN_SEED, buildMaterialenSeed } from '@/data/materiaalsoortenSeed';
import { SEGMENTEN_SEED, MATEN_SEED, buildKunstwerkenSeed } from '@/data/kunstwerkenSeed';
import { BEDRIJFSGEGEVENS_SEED } from '@/data/bedrijfsgegevensSeed';
import { BESTELINSTELLINGEN_SEED } from '@/data/bestelinstellingenSeed';

interface BeheerShellProps {
  email: string;
  onLogout: () => void;
}

type RawBestelling = Omit<Bestelling, 'companyName'>;

export function BeheerShell({ email, onLogout }: BeheerShellProps) {
  const t = useTranslations('beheer');
  const [activeSection, setActiveSection] = useState<BeheerSection>('klanten');
  const [klanten, setKlanten] = useState<Klant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rawBestellingen, setRawBestellingen] = useState<RawBestelling[] | null>(null);
  const [bestellingenLoadError, setBestellingenLoadError] = useState<string | null>(null);
  const [activiteiten, setActiviteiten] = useState<Activiteit[] | null>(null);
  const [activiteitenLoadError, setActiviteitenLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadKlanten() {
      try {
        const snapshot = await getDocs(collection(db, 'klanten'));
        if (cancelled) return;
        setKlanten(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              companyName: data.companyName,
              kvk: data.kvk,
              contactPerson: data.contactPerson,
              email: data.email,
              phone: data.phone,
              contactPreference: data.contactPreference,
              address: data.address,
              postcode: data.postcode,
              city: data.city,
              deliveryAddress: data.deliveryAddress ?? '',
              deliveryPostcode: data.deliveryPostcode ?? '',
              deliveryCity: data.deliveryCity ?? '',
              invoiceAddress: data.invoiceAddress ?? '',
              invoicePostcode: data.invoicePostcode ?? '',
              invoiceCity: data.invoiceCity ?? '',
              status: data.status,
              prijsgroepId: data.prijsgroepId,
              exclusieveKunstenaarIds: data.exclusieveKunstenaarIds ?? [],
              minimaleAfname: data.minimaleAfname ?? null,
            } as Klant;
          })
        );
        setLoadError(null);
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
        const headersSnapshot = await getDocs(collection(db, 'bestelheaders'));
        const rows = await Promise.all(
          headersSnapshot.docs.map(async (headerDoc) => {
            const linesSnapshot = await getDocs(
              collection(db, 'bestelheaders', headerDoc.id, 'bestellines')
            );
            const lines: BestellingLine[] = linesSnapshot.docs.map((lineDoc) => {
              const lineData = lineDoc.data();
              return {
                id: lineDoc.id,
                kunstwerkId: lineData.kunstwerkId,
                maatId: lineData.maatId,
                materiaalId: lineData.materiaalId,
                breedte: lineData.breedte,
                hoogte: lineData.hoogte,
                prijs: lineData.prijs ?? null,
                quantity: lineData.quantity,
              };
            });
            const data = headerDoc.data();
            return {
              id: headerDoc.id,
              klantId: data.klantId,
              besteldatum: data.besteldatum?.toDate().toLocaleDateString('nl-NL') ?? '',
              status: data.status,
              lineCount: lines.length,
              totalQuantity: lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
              lines,
            } as RawBestelling;
          })
        );
        if (!cancelled) {
          setRawBestellingen(rows);
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
        const snapshot = await getDocs(
          query(collection(db, 'activiteitenlog'), orderBy('timestamp', 'desc'), limit(500))
        );
        if (cancelled) return;
        setActiviteiten(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              type: data.type as ActiviteitType,
              actorEmail: data.actorEmail,
              actorNaam: data.actorNaam,
              timestamp: data.timestamp?.toDate() ?? null,
            } as Activiteit;
          })
        );
        setActiviteitenLoadError(null);
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

  function handleKlantUpdated(updated: Klant) {
    setKlanten((current) => (current ?? []).map((klant) => (klant.id === updated.id ? updated : klant)));
  }

  function handleBestellingUpdated(updated: Bestelling) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) => (row.id === updated.id ? { ...row, status: updated.status } : row))
    );
  }

  function handleLinePrijsVastgesteld(bestellingId: string, lineId: string, prijs: number) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === bestellingId
          ? { ...row, lines: row.lines.map((line) => (line.id === lineId ? { ...line, prijs } : line)) }
          : row
      )
    );
  }

  function handleLineUpdated(bestellingId: string, lineId: string, updates: Partial<BestellingLine>) {
    setRawBestellingen((current) =>
      (current ?? []).map((row) =>
        row.id === bestellingId
          ? { ...row, lines: row.lines.map((line) => (line.id === lineId ? { ...line, ...updates } : line)) }
          : row
      )
    );
  }

  const bestellingen = useMemo(() => {
    if (rawBestellingen === null) return null;
    return rawBestellingen.map((row) => ({
      ...row,
      companyName: (klanten ?? []).find((klant) => klant.id === row.klantId)?.companyName ?? row.klantId,
    }));
  }, [rawBestellingen, klanten]);

  const materiaalsoorten = useFirestoreCollection<Materiaalsoort>('materiaalsoorten', {
    seed: MATERIAALSOORTEN_SEED,
  });
  const materialenSeed = materiaalsoorten.items ? buildMaterialenSeed(materiaalsoorten.items) : undefined;
  const materialen = useFirestoreCollection<Materiaal>('materialen', {
    seed: materialenSeed,
    skip: materiaalsoorten.items === null,
  });
  const maten = useFirestoreCollection<Maat>('maten', { seed: MATEN_SEED });
  const segmenten = useFirestoreCollection<Segment>('segmenten', { seed: SEGMENTEN_SEED });

  const kunstwerkenReady = segmenten.items !== null && materialen.items !== null && maten.items !== null;
  const kunstwerkenSeed = kunstwerkenReady
    ? buildKunstwerkenSeed(segmenten.items!, materialen.items!, maten.items!)
    : undefined;
  // Seeding writes all 36 kunstwerken documents one at a time; if a write fails partway
  // through, the collection is left partially seeded and useFirestoreCollection will not
  // retry the seed (its guard only fires when the collection comes back empty). Recovery
  // in that case requires an admin manually deleting the partial documents so the
  // collection is empty again before a reload can re-trigger the seed.
  const kunstwerken = useFirestoreCollection<Kunstwerk>('kunstwerken', {
    seed: kunstwerkenSeed,
    skip: !kunstwerkenReady,
  });
  const prijsgroepen = useFirestoreCollection<Prijsgroep>('prijsgroepen');
  const kunstenaars = useFirestoreCollection<Kunstenaar>('kunstenaars');

  /**
   * Het ENIGE schrijfpad naar `kunstenaars/{id}`.
   *
   * Elke update moet het legacy `prijsafspraken`-veld strippen (zie KunstenaarUpdate),
   * maar strippen zonder migreren zou de interne afspraken van een nog niet gemigreerde
   * kunstenaar stilzwijgend wissen. Daarom staat "eerst migreren, dan strippen" hier op
   * één plek in plaats van in elke aanroepende component: KunstenaarsSection (opslaan) en
   * KlantModal (exclusiviteit) krijgen dit als gewone update-functie doorgegeven en hoeven
   * van de splitsing niets te weten.
   */
  async function updateKunstenaarVeilig(
    id: string,
    data: Partial<Omit<Kunstenaar, 'id'>>
  ): Promise<boolean> {
    const kunstenaar = (kunstenaars.items ?? []).find((item) => item.id === id) as
      | (Kunstenaar & { prijsafspraken?: string })
      | undefined;
    const legacyPrijsafspraken = kunstenaar?.prijsafspraken;
    if (legacyPrijsafspraken) {
      const afsprakenSnap = await getDoc(doc(db, 'kunstenaarAfspraken', id));
      // Bestaat het afsprakendocument al, dan is dat de actuele waarde (of de zojuist
      // opgeslagen invoer van de gebruiker) en mag de legacy-waarde die niet overschrijven.
      if (!afsprakenSnap.exists()) {
        await setDoc(doc(db, 'kunstenaarAfspraken', id), { prijsafspraken: legacyPrijsafspraken });
      }
    }
    return kunstenaars.update(id, { ...data, prijsafspraken: deleteField() } as KunstenaarUpdate);
  }
  const drukkers = useFirestoreCollection<Drukker>('drukkers');
  const bedrijfsgegevens = useFirestoreDocument<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens', {
    seed: BEDRIJFSGEGEVENS_SEED,
  });
  const bestelinstellingen = useFirestoreDocument<Bestelinstellingen>('instellingen', 'bestelinstellingen', {
    seed: BESTELINSTELLINGEN_SEED,
  });

  const klantenCount = (klanten ?? []).filter((klant) => klant.status === 'Beoordelen').length;
  const bestellingenCount = (bestellingen ?? []).filter((b) => b.status === 'Te beoordelen').length;
  const materiaalsoortenCount = (materiaalsoorten.items ?? []).length;
  const materialenCount = (materialen.items ?? []).length;
  const matenCount = (maten.items ?? []).length;
  const segmentenCount = (segmenten.items ?? []).length;
  const kunstwerkenCount = (kunstwerken.items ?? []).length;
  const prijsgroepenCount = (prijsgroepen.items ?? []).length;
  const kunstenaarsCount = (kunstenaars.items ?? []).length;
  const drukkersCount = (drukkers.items ?? []).length;
  const activiteitCount = (activiteiten ?? []).length;

  return (
    <div
      data-testid="beheer-dashboard"
      className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]"
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
          kunstwerkenCount={kunstwerkenCount}
          kunstenaarsCount={kunstenaarsCount}
          prijsgroepenCount={prijsgroepenCount}
          drukkersCount={drukkersCount}
          activiteitCount={activiteitCount}
        />
      </GlassPanel>
      <GlassPanel className="w-full !max-w-none">
        {activeSection === 'klanten' ? (
          <KlantenSection
            klanten={klanten}
            prijsgroepen={prijsgroepen.items}
            kunstenaars={kunstenaars.items}
            loadError={loadError}
            onKlantUpdated={handleKlantUpdated}
            onKunstenaarUpdated={updateKunstenaarVeilig}
          />
        ) : activeSection === 'bestellingen' ? (
          <BestellingenSection
            bestellingen={bestellingen}
            kunstwerken={kunstwerken.items}
            materialen={materialen.items}
            maten={maten.items}
            materiaalsoorten={materiaalsoorten.items}
            klanten={klanten}
            drukkers={drukkers.items}
            loadError={bestellingenLoadError}
            onBestellingUpdated={handleBestellingUpdated}
            onLinePrijsVastgesteld={handleLinePrijsVastgesteld}
            onLineUpdated={handleLineUpdated}
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
            onAdd={materialen.add}
            onUpdate={materialen.update}
            onRemove={materialen.remove}
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
            loadError={segmenten.error === 'load' ? t('segmentenLoadError') : null}
            onAdd={segmenten.add}
            onUpdate={segmenten.update}
            onRemove={segmenten.remove}
          />
        ) : activeSection === 'kunstwerken' ? (
          <KunstwerkenSection
            kunstwerken={kunstwerken.items}
            segmenten={segmenten.items}
            materialen={materialen.items}
            materiaalsoorten={materiaalsoorten.items}
            maten={maten.items}
            kunstenaars={kunstenaars.items}
            loadError={kunstwerken.error === 'load' ? t('kunstwerkenLoadError') : null}
            onAdd={kunstwerken.add}
            onUpdate={kunstwerken.update}
            onRemove={kunstwerken.remove}
          />
        ) : activeSection === 'kunstenaars' ? (
          <KunstenaarsSection
            kunstenaars={kunstenaars.items}
            klanten={klanten}
            kunstwerken={kunstwerken.items}
            loadError={kunstenaars.error === 'load' ? t('kunstenaarsLoadError') : null}
            onUpdate={updateKunstenaarVeilig}
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
        ) : activeSection === 'drukkers' ? (
          <DrukkersSection
            drukkers={drukkers.items}
            loadError={drukkers.error === 'load' ? t('drukkersLoadError') : null}
            onAdd={drukkers.add}
            onUpdate={drukkers.update}
            onRemove={drukkers.remove}
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
          />
        ) : (
          <ActiviteitSection activiteiten={activiteiten} loadError={activiteitenLoadError} />
        )}
      </GlassPanel>
    </div>
  );
}
