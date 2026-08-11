'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface AfwijzenBevestiging {
  /** True zodra de bevestiging open staat. */
  open: boolean;
  /** De ingevoerde reden, leeg bij het openen. */
  reden: string;
  vraag: () => void;
  wijzigReden: (reden: string) => void;
  annuleer: () => void;
}

export function useAfwijzenBevestiging(): AfwijzenBevestiging {
  const [open, setOpen] = useState(false);
  const [reden, setReden] = useState('');

  const vraag = useCallback(() => {
    setReden('');
    setOpen(true);
  }, []);

  const wijzigReden = useCallback((nextReden: string) => {
    setReden(nextReden);
  }, []);

  const annuleer = useCallback(() => {
    setOpen(false);
    setReden('');
  }, []);

  return { open, reden, vraag, wijzigReden, annuleer };
}

export function AfwijzenBevestigingTekst({
  item,
  reden,
  onWijzigReden,
  testId,
}: {
  item: string;
  reden: string;
  onWijzigReden: (reden: string) => void;
  testId: string;
}) {
  const t = useTranslations('beheer');
  return (
    <div data-testid={testId} className="flex flex-col gap-3 text-sm text-white/80">
      <p>{t('afwijzenBevestigingVraag', { item })}</p>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-white/60">
          {t('afwijzenBevestigingRedenLabel')}
        </span>
        <textarea
          value={reden}
          onChange={(event) => onWijzigReden(event.target.value)}
          placeholder={t('afwijzenBevestigingRedenPlaceholder')}
          data-testid={`${testId}-reden`}
          rows={3}
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
        <span className="text-xs text-white/50">{t('afwijzenBevestigingRedenVerplicht')}</span>
      </label>
    </div>
  );
}

export function AfwijzenBevestigingActies({
  reden,
  onBevestig,
  onAnnuleer,
  testIdPrefix,
  isBezig = false,
}: {
  reden: string;
  onBevestig: () => void;
  onAnnuleer: () => void;
  /** Enkelvoudsvorm van de sectie, bijvoorbeeld `klant` — bepaalt de testids. */
  testIdPrefix: string;
  isBezig?: boolean;
}) {
  const t = useTranslations('beheer');
  return (
    <>
      <button
        type="button"
        onClick={onBevestig}
        disabled={reden.trim() === '' || isBezig}
        data-testid={`${testIdPrefix}-modal-afwijzen-bevestigen`}
        className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
      >
        {t('afwijzenBevestigen')}
      </button>
      <button
        type="button"
        onClick={onAnnuleer}
        disabled={isBezig}
        data-testid={`${testIdPrefix}-modal-afwijzen-annuleren`}
        className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
      >
        {t('annuleren')}
      </button>
    </>
  );
}
