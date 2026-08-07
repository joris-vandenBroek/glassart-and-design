'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import type { ZendingGenoten } from '@/lib/zendingGenoten';

interface AfrondenBevestigingDialogProps {
  isOpen: boolean;
  genoten: ZendingGenoten[];
  onAlleenDeze: () => void;
  onOokDeze: () => void;
  onClose: () => void;
  isBezig?: boolean;
}

export function AfrondenBevestigingDialog({
  isOpen,
  genoten,
  onAlleenDeze,
  onOokDeze,
  onClose,
  isBezig = false,
}: AfrondenBevestigingDialogProps) {
  const t = useTranslations('beheer');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={t('bestellingenAfrondenTitel')}
      footerActions={
        <>
          <button
            type="button"
            onClick={onOokDeze}
            disabled={isBezig}
            data-testid="afronden-bevestiging-ook-deze"
            className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
          >
            {t('bestellingenAfrondenOokDeze')}
          </button>
          <button
            type="button"
            onClick={onAlleenDeze}
            disabled={isBezig}
            data-testid="afronden-bevestiging-alleen-deze"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {t('bestellingenAfrondenAlleenDeze')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isBezig}
            data-testid="afronden-bevestiging-annuleren"
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {t('annuleren')}
          </button>
        </>
      }
    >
      <div data-testid="afronden-bevestiging" className="flex flex-col gap-3 text-sm text-white/80">
        <p>{t('bestellingenAfrondenUitleg')}</p>
        {genoten.map(({ zending, bestellingen }) => (
          <div key={zending.id} className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-white/60">
              {zending.verzondenOp
                ? t('bestellingenAfrondenZending', {
                    drukker: zending.drukkerNaam,
                    datum: zending.verzondenOp.toLocaleDateString('nl-NL'),
                  })
                : t('bestellingenAfrondenZendingOnbekend', { drukker: zending.drukkerNaam })}
            </span>
            <ul className="list-disc pl-5 text-xs text-white/70">
              {bestellingen.map((bestelling) => (
                <li key={bestelling.id}>
                  {bestelling.bestelnr} — {bestelling.companyName}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
