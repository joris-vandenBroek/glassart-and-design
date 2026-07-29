'use client';

import { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { logActiviteit, actorFromMedewerker } from '@/lib/logActiviteit';
import { buildDrukkerMail } from '@/lib/buildDrukkerMail';
import type { Bestelling } from './BestellingenSection';
import type { Klant } from './KlantenSection';
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
  const [drukkerId, setDrukkerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [mailSent, setMailSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDrukkerId(drukkers[0]?.id ?? '');
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

  const mail = useMemo(
    () => buildDrukkerMail({ bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten }),
    [bestellingen, klanten, kunstwerken, materialen, maten, materiaalsoorten]
  );

  function handleDialogClose() {
    if (isSending) return;
    onClose();
  }

  async function handleVersturen() {
    const drukker = drukkers.find((d) => d.id === drukkerId);
    const endpoint = process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL;
    const secret = process.env.NEXT_PUBLIC_MAIL_SECRET;
    if (!drukker || !endpoint || !secret || heeftOntbrekendeKlantgegevens) {
      setError(t('drukkerVersturenMailError'));
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, to: drukker.email, subject: mail.subject, body: mail.body }),
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
          onderwerp: mail.subject,
          body: mail.body,
          bestellingIds: bestellingen.map((b) => b.id),
          aantalKlanten: new Set(bestellingen.map((b) => b.klantId)).size,
          aantalRegels: bestellingen.reduce((sum, b) => sum + b.lineCount, 0),
          verzondDoor: user?.email ?? 'Onbekend',
        }),
      });
      if (!zendingResponse.ok) throw new Error('zending create failed');
      const results = await Promise.all(
        bestellingen.map((bestelling) =>
          fetch(`/api/bestelheaders/${bestelling.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'Verstuurd naar drukker' }),
          })
        )
      );
      if (results.some((response) => !response.ok)) throw new Error('status update failed');
      void logActiviteit(
        'bestelling_verstuurd_naar_drukker',
        actorFromMedewerker(user),
        bestellingen.map((b) => b.bestelnr).join(', ')
      );
      onVerstuurd(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const })));
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
            disabled={isSending || !drukkerId || mailSent || heeftOntbrekendeKlantgegevens}
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
          {t('drukkerVersturenLabelDrukker')}
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

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-white/60">{t('drukkerVersturenLabelPreview')}</span>
          <pre
            data-testid="drukker-versturen-preview"
            className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-sm bg-black/40 p-3 text-xs text-white/80"
          >
            {mail.subject}
            {'\n\n'}
            {mail.body}
          </pre>
        </div>

        {heeftOntbrekendeKlantgegevens && (
          <p data-testid="drukker-versturen-klant-ontbreekt" className="text-xs text-red-400">
            {t('drukkerVersturenKlantgegevensOntbreken', { n: aantalBestellingenMetOntbrekendeKlant })}
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
