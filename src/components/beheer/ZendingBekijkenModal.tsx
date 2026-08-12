'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { HelpLink } from '@/components/HelpLink';
import { ModalTabs } from '@/components/ModalTabs';
import { ProductImage } from '@/components/ProductImage';
import { resolveRegel, formatAfleveradres } from '@/lib/buildDrukkerMail';
import type { DrukkerZending } from '@/lib/useDrukkerZendingen';
import type { Bestelling } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Klant } from './KlantenSection';

interface ZendingBekijkenModalProps {
  zending: DrukkerZending | null;
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  onClose: () => void;
}

export function ZendingBekijkenModal({
  zending,
  bestellingen,
  kunstwerken,
  materialen,
  maten,
  materiaalsoorten,
  klanten,
  onClose,
}: ZendingBekijkenModalProps) {
  const t = useTranslations('beheer');
  const [gekozenBestelnr, setGekozenBestelnr] = useState<string | null>(null);

  const orders = zending
    ? zending.bestellingIds
        .map((bestelnr) => (bestellingen ?? []).find((b) => b.bestelnr === bestelnr))
        .filter((b): b is Bestelling => b != null)
    : [];

  // Zelfherstellend in plaats van een useEffect-reset: zodra `orders` verandert (nieuwe
  // zending geopend, of `bestellingen` alsnog geladen) en het eerder gekozen bestelnr daar niet
  // meer in voorkomt, valt dit terug op de eerste bestelling -- zonder een effect dat op het
  // juiste moment moet vuren.
  const actieveBestelnr =
    gekozenBestelnr && orders.some((b) => b.bestelnr === gekozenBestelnr) ? gekozenBestelnr : (orders[0]?.bestelnr ?? null);

  return (
    <Modal
      isOpen={zending !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      wide
      title={
        <span className="flex w-full items-center justify-between gap-2 pr-2">
          {t('drukkersZendingModalTitel')}
          <HelpLink
            anchor="drukkers-zending-bekijken"
            label="Open het hoofdstuk over een verzonden zending bekijken"
            testId="zending-bekijken-modal-help"
          />
        </span>
      }
      subtitle={
        zending ? (
          <span>
            {zending.zendingnummer && `${zending.zendingnummer} · `}
            {zending.verzondenOp ? zending.verzondenOp.toLocaleString('nl-NL') : ''}
          </span>
        ) : undefined
      }
    >
      {zending && (
        <div data-testid="zending-bekijken-modal" className="flex flex-col gap-3 text-sm text-white/80">
          {orders.length === 0 ? (
            bestellingen === null ? null : (
              <p data-testid="zending-bekijken-modal-leeg" className="text-xs text-white/50">
                {t('drukkersZendingModalGeenBestellingen')}
              </p>
            )
          ) : (
            <>
              {orders.length > 1 && (
                <ModalTabs
                  tabs={orders.map((bestelling) => ({ id: bestelling.bestelnr, label: bestelling.bestelnr }))}
                  activeTabId={actieveBestelnr ?? orders[0].bestelnr}
                  onTabChange={setGekozenBestelnr}
                  testIdPrefix="zending-bekijken"
                />
              )}
              {orders.map((bestelling) => {
                const klant = (klanten ?? []).find((k) => k.klantnr === bestelling.klantnr);
                const isActief = orders.length === 1 || bestelling.bestelnr === actieveBestelnr;

                return (
                  <div
                    key={bestelling.id}
                    data-testid={`zending-bekijken-bestelling-${bestelling.id}`}
                    className={isActief ? 'flex flex-col gap-3' : 'hidden'}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                        {bestelling.companyName} · {bestelling.bestelnr} · {bestelling.besteldatum}
                      </p>
                      <p className="mt-0.5 text-xs text-white/50">
                        Afleveradres: {klant ? formatAfleveradres(klant) : 'Onbekend afleveradres'}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-2 text-xs">
                      {bestelling.lines.map((line) => {
                        const { kunstwerk, naam, materiaalOmschrijving, maatOmschrijving } = resolveRegel(
                          line,
                          kunstwerken ?? [],
                          materialen ?? [],
                          maten ?? [],
                          materiaalsoorten ?? []
                        );

                        return (
                          <li
                            key={line.id}
                            data-testid={`zending-bekijken-line-${line.id}`}
                            className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                          >
                            {kunstwerk?.foto ? (
                              <ProductImage
                                src={kunstwerk.foto}
                                alt=""
                                className="h-[72px] w-[72px] shrink-0 rounded-md"
                              />
                            ) : (
                              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                                ?
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-white/90">{naam}</p>
                              <p className="text-white/60">{materiaalOmschrijving}</p>
                              <p className="text-white/60">
                                Maat: {maatOmschrijving} · Aantal: {line.quantity}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
