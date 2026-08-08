'use client';

import { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit } from '@/lib/logActiviteit';
import { useApiRecord } from '@/lib/useApiRecord';
import { buildDrukkerMail, ontbrekendeFactuurvoetjeVelden, ontbrekendeKlantVelden } from '@/lib/buildDrukkerMail';
import type { Bestelling } from './BestellingenSection';
import type { Klant } from './KlantenSection';
import type { Bedrijfsgegevens } from './bedrijfsgegevensTypes';
import type { Drukker, Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';

interface VersturenNaarDrukkerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bestellingen: Bestelling[];
  klanten: Klant[];
  drukkers: Drukker[];
  kunstwerken: Kunstwerk[];
  materialen: Materiaal[];
  maten: Maat[];
  materiaalsoorten: Materiaalsoort[];
  onVerstuurd: (updated: Bestelling[]) => void;
}

export function VersturenNaarDrukkerDialog({
  isOpen,
  onClose,
  bestellingen,
  klanten,
  drukkers,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  onVerstuurd,
}: VersturenNaarDrukkerDialogProps) {
  const t = useTranslations('beheer');
  const { user } = useAdminAuth();
  const { data: bedrijfsgegevens, error: bedrijfsgegevensError } = useApiRecord<Bedrijfsgegevens>('instellingen', 'bedrijfsgegevens');
  const heeftBedrijfsgegevensFout = bedrijfsgegevensError === 'load';
  const [drukkerId, setDrukkerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [mailSent, setMailSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDrukkerId(drukkers.find((d) => d.standaard)?.id ?? drukkers[0]?.id ?? '');
      setError(null);
      setIsSending(false);
      setMailSent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const ontbrekendeKlantIds = useMemo(
    () =>
      Array.from(new Set(bestellingen.map((b) => b.klantId))).filter(
        (klantId) => !klanten.some((k) => k.id === klantId)
      ),
    [bestellingen, klanten]
  );
  const heeftOntbrekendeKlantgegevens = ontbrekendeKlantIds.length > 0;
  const aantalBestellingenMetOntbrekendeKlant = useMemo(
    () => bestellingen.filter((b) => ontbrekendeKlantIds.includes(b.klantId)).length,
    [bestellingen, ontbrekendeKlantIds]
  );

  // Klanten die wél bestaan maar velden missen die de drukker nodig heeft.
  // Zonder deze controle ging een onbruikbaar bezorgadres gewoon de deur uit.
  const onvolledigeKlanten = useMemo(
    () =>
      Array.from(new Set(bestellingen.map((b) => b.klantId)))
        .map((klantId) => klanten.find((k) => k.id === klantId))
        .filter((klant): klant is Klant => klant !== undefined)
        .map((klant) => ({ klant, velden: ontbrekendeKlantVelden(klant) }))
        .filter((entry) => entry.velden.length > 0),
    [bestellingen, klanten]
  );
  const heeftOnvolledigeKlantgegevens = onvolledigeKlanten.length > 0;

  const ontbrekendeBedrijfsvelden = useMemo(
    () => ontbrekendeFactuurvoetjeVelden(bedrijfsgegevens),
    [bedrijfsgegevens]
  );
  const heeftOnvolledigeBedrijfsgegevens = ontbrekendeBedrijfsvelden.length > 0;
  // useApiRecord mapt een 404 op `data: null, error: null`, dus een ontbrekende
  // instellingen-rij is niet aan `bedrijfsgegevensError` te herkennen. Zonder
  // deze aparte melding zou de medewerker een grijze Versturen-knop zien zonder
  // enige uitleg -- reëel sinds het seed-mechanisme weg is en er dus niets meer
  // is dat de rij automatisch aanmaakt.
  const mistBedrijfsgegevensRecord = !bedrijfsgegevens && !heeftBedrijfsgegevensFout;

  const mail = useMemo(
    () =>
      // Alleen opbouwen wanneer de dialoog daadwerkelijk open is. Dit component
      // is altijd gemount vanuit BestellingenSection, dus zonder deze conditie
      // draait de mailopbouw bij elke render van het bestellingenscherm --
      // werk dat niemand ziet, en vroeger de plek waar één ontbrekend
      // bedrijfsgegeven het hele scherm meesleurde.
      isOpen && bedrijfsgegevens && !heeftOnvolledigeBedrijfsgegevens
        ? buildDrukkerMail({ bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten, bedrijfsgegevens })
        : null,
    [
      isOpen,
      bestellingen,
      klanten,
      kunstwerken,
      materialen,
      maten,
      materiaalsoorten,
      bedrijfsgegevens,
      heeftOnvolledigeBedrijfsgegevens,
    ]
  );

  function handleDialogClose() {
    if (isSending) return;
    onClose();
  }

  async function handleVersturen() {
    const drukker = drukkers.find((d) => d.id === drukkerId);
    if (
      !drukker ||
      !mail ||
      heeftOntbrekendeKlantgegevens ||
      heeftOnvolledigeKlantgegevens
    ) {
      setError(t('drukkerVersturenMailError'));
      return;
    }

    setIsSending(true);
    setError(null);

    let zendingnummer: string;
    try {
      const nummerResponse = await fetch(`/api/drukkers/${drukkerId}/zendingen/nummer`, { method: 'POST' });
      if (!nummerResponse.ok) throw new Error('nummer reservation failed');
      const nummerData = (await nummerResponse.json()) as { zendingnummer?: unknown };
      if (typeof nummerData?.zendingnummer !== 'string' || nummerData.zendingnummer === '') {
        throw new Error('nummer reservation returned an unexpected shape');
      }
      zendingnummer = nummerData.zendingnummer;
    } catch {
      setError(t('drukkerVersturenMailError'));
      setIsSending(false);
      return;
    }

    const subjectMetZendingnummer = `${zendingnummer} — ${mail.subject}`;

    try {
      // De ontvanger komt niet meer uit deze request mee: /api/mail zoekt het
      // e-mailadres zelf bij `drukkerId` op, zodat de relay niet vanaf de client
      // naar een willekeurig adres te sturen is.
      const response = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soort: 'drukker',
          drukkerId,
          subject: subjectMetZendingnummer,
          body: mail.text,
          html: mail.html,
        }),
      });
      if (!response.ok) {
        setError(t('drukkerVersturenMailError'));
        setIsSending(false);
        return;
      }
    } catch {
      setError(t('drukkerVersturenMailError'));
      setIsSending(false);
      return;
    }

    setMailSent(true);

    try {
      const zendingResponse = await fetch(`/api/drukkers/${drukkerId}/zendingen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onderwerp: subjectMetZendingnummer,
          body: mail.text,
          bestellingIds: bestellingen.map((b) => b.id),
          aantalKlanten: new Set(bestellingen.map((b) => b.klantId)).size,
          aantalRegels: bestellingen.reduce((sum, b) => sum + b.lineCount, 0),
          verzondDoor: user?.email ?? 'Onbekend',
          zendingnummer,
        }),
      });
      if (!zendingResponse.ok) throw new Error('zending create failed');
      const results = await Promise.all(
        bestellingen.map((bestelling) =>
          fetch(`/api/bestelheaders/${bestelling.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'Verstuurd naar drukker', zendingnummer }),
          })
        )
      );
      if (results.some((response) => !response.ok)) throw new Error('status update failed');
      void logActiviteit(
        'bestelling_verstuurd_naar_drukker',
        bestellingen.map((b) => b.bestelnr).join(', ')
      );
      onVerstuurd(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const, zendingnummer })));
      onClose();
    } catch {
      setError(t('drukkerVersturenStatusError'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDialogClose}
      closeLabel={t('modalClose')}
      title={t('drukkerVersturenTitel')}
      footerActions={
        <>
          <button
            type="button"
            onClick={handleVersturen}
            disabled={
              isSending ||
              !drukkerId ||
              mailSent ||
              heeftOntbrekendeKlantgegevens ||
              heeftOnvolledigeKlantgegevens ||
              !mail
            }
            data-testid="drukker-versturen-versturen"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('drukkerVersturenVersturen')}
          </button>
          <button
            type="button"
            onClick={handleDialogClose}
            disabled={isSending}
            data-testid="drukker-versturen-annuleren"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {t('annuleren')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-white/80">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
          <span>
            {t('drukkerVersturenLabelDrukker')}
            <RequiredMark />
          </span>
          <select
            value={drukkerId}
            onChange={(event) => setDrukkerId(event.target.value)}
            data-testid="drukker-versturen-drukker"
            className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
          >
            {drukkers.map((drukker) => (
              <option key={drukker.id} value={drukker.id}>
                {drukker.naam}
              </option>
            ))}
          </select>
        </label>

        <RequiredLegend testId="drukker-versturen-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('drukkerVersturenLabelPreview')}</span>
          <p data-testid="drukker-versturen-onderwerp" className="text-xs text-white/70">
            {mail?.subject}
            {mail && <span className="text-white/40"> · {t('drukkerVersturenZendingnummerToelichting')}</span>}
          </p>
          <div
            data-testid="drukker-versturen-preview"
            className="max-h-64 overflow-y-auto rounded-sm bg-white p-3 text-xs"
            dangerouslySetInnerHTML={{ __html: mail?.html ?? '' }}
          />
        </div>

        {heeftOntbrekendeKlantgegevens && (
          <p data-testid="drukker-versturen-klant-ontbreekt" className="text-xs text-red-400">
            {t('drukkerVersturenKlantgegevensOntbreken', { n: aantalBestellingenMetOntbrekendeKlant })}
          </p>
        )}

        {heeftOnvolledigeKlantgegevens && (
          <div data-testid="drukker-versturen-klant-onvolledig" className="flex flex-col gap-1 text-xs text-red-400">
            <span>{t('drukkerVersturenKlantgegevensOnvolledigTitel')}</span>
            <ul className="list-disc pl-5">
              {onvolledigeKlanten.map(({ klant, velden }) => (
                <li key={klant.id}>
                  {t('drukkerVersturenKlantgegevensOnvolledigRegel', {
                    klant: klant.companyName?.trim() || t('drukkerVersturenKlantZonderNaam'),
                    velden: velden.map((veld) => t(`klantVeld_${veld}`)).join(', '),
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {heeftBedrijfsgegevensFout && (
          <p data-testid="drukker-versturen-bedrijfsgegevens-fout" className="text-xs text-red-400">
            {t('drukkerVersturenBedrijfsgegevensFout')}
          </p>
        )}

        {heeftOnvolledigeBedrijfsgegevens && (
          <p data-testid="drukker-versturen-bedrijfsgegevens-onvolledig" className="text-xs text-red-400">
            {t('drukkerVersturenBedrijfsgegevensOnvolledig', {
              velden: ontbrekendeBedrijfsvelden.map((veld) => t(`bedrijfsgegevensVeld_${veld}`)).join(', '),
              aantal: ontbrekendeBedrijfsvelden.length,
            })}
          </p>
        )}

        {mistBedrijfsgegevensRecord && (
          <p data-testid="drukker-versturen-bedrijfsgegevens-ontbreekt" className="text-xs text-red-400">
            {t('drukkerVersturenBedrijfsgegevensOntbreekt')}
          </p>
        )}

        {error && (
          <p data-testid="drukker-versturen-error" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
