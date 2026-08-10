'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Fase = 'rust' | 'bevestigen' | 'getoond';

/**
 * Geeft telefonisch een nieuw wachtwoord uit aan een klant die niet meer bij
 * zijn mail kan. De hoofdroute blijft de "wachtwoord vergeten"-link op het
 * inlogscherm; dit is de noodroute.
 *
 * Het wachtwoord staat alleen in deze component-state. De omliggende Modal
 * unmount bij sluiten, dus het verdwijnt vanzelf en is daarna nergens meer op
 * te vragen -- op de server staat alleen een hash.
 */
export function KlantWachtwoordSectie({ klantId }: { klantId: string }) {
  const t = useTranslations('beheer');
  const [fase, setFase] = useState<Fase>('rust');
  const [wachtwoord, setWachtwoord] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  // De endpoint is niet idempotent (nieuw wachtwoord, hash overschreven, reset-tokens
  // en sessies vervallen) en onomkeerbaar, dus een tweede klik terwijl het eerste
  // verzoek nog loopt mag nooit een tweede aanvraag versturen.
  const [bezig, setBezig] = useState(false);

  async function handleBevestigen() {
    if (bezig) return;
    setBezig(true);
    setFout(null);
    try {
      const response = await fetch(`/api/klanten/${klantId}/wachtwoord`, { method: 'POST' });
      if (!response.ok) throw new Error('uitgeven mislukt');
      const body = (await response.json()) as { wachtwoord: string };
      setWachtwoord(body.wachtwoord);
      setFase('getoond');
    } catch {
      setFout(t('klantenWachtwoordFout'));
      setFase('rust');
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
      <span className="text-xs uppercase tracking-wide text-white/60">
        {t('klantenWachtwoordTitel')}
      </span>

      {fase === 'rust' && (
        <button
          type="button"
          onClick={() => {
            setFout(null);
            setFase('bevestigen');
          }}
          data-testid="klant-wachtwoord-uitgeven"
          className="btn-beheer-secondary self-start rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
        >
          {t('klantenWachtwoordUitgeven')}
        </button>
      )}

      {fase === 'bevestigen' && (
        <div className="flex flex-col gap-2">
          <p data-testid="klant-wachtwoord-waarschuwing" className="text-xs text-amber-300">
            {t('klantenWachtwoordWaarschuwing')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleBevestigen}
              disabled={bezig}
              data-testid="klant-wachtwoord-bevestigen"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('klantenWachtwoordBevestigen')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFout(null);
                setFase('rust');
              }}
              disabled={bezig}
              data-testid="klant-wachtwoord-annuleren"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
            >
              {t('annuleren')}
            </button>
          </div>
        </div>
      )}

      {fase === 'getoond' && wachtwoord && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <code
              data-testid="klant-wachtwoord-waarde"
              className="rounded-sm bg-black/40 px-3 py-2 font-mono text-lg tracking-[0.2em] text-white"
            >
              {wachtwoord}
            </code>
            <button
              type="button"
              // Buiten een beveiligde context (en in de testomgeving) bestaat
              // navigator.clipboard niet; het voorlezen blijft dan gewoon werken.
              onClick={() => void navigator.clipboard?.writeText(wachtwoord)}
              data-testid="klant-wachtwoord-kopieren"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('klantenWachtwoordKopieren')}
            </button>
          </div>
          <p className="text-xs text-white/60">{t('klantenWachtwoordUitleg')}</p>
        </div>
      )}

      {fout && (
        <p data-testid="klant-wachtwoord-fout" className="text-xs text-red-400">
          {fout}
        </p>
      )}
    </div>
  );
}
