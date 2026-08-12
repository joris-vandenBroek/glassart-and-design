'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { HelpLink } from '@/components/HelpLink';
import { ProductImage } from '@/components/ProductImage';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import { berekenBestellingTotalen } from '@/lib/bestellingTotalen';
import type { DrukkerZending } from '@/lib/useDrukkerZendingen';
import type { Bestelling } from './BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './materiaalTypes';
import type { Klant } from './KlantenSection';
import type { BtwTarieven } from './btwTarievenTypes';

interface ZendingBekijkenModalProps {
  zending: DrukkerZending | null;
  bestellingen: Bestelling[] | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  klanten: Klant[] | null;
  btwTarieven: BtwTarieven | null;
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
  btwTarieven,
  onClose,
}: ZendingBekijkenModalProps) {
  const t = useTranslations('beheer');

  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijvingNl])
  );

  const orders = zending
    ? zending.bestellingIds
        .map((bestelnr) => (bestellingen ?? []).find((b) => b.bestelnr === bestelnr))
        .filter((b): b is Bestelling => b != null)
    : [];

  return (
    <Modal
      isOpen={zending !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
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
        <div data-testid="zending-bekijken-modal" className="flex flex-col gap-4 text-sm text-white/80">
          {orders.length === 0 ? (
            <p data-testid="zending-bekijken-modal-leeg" className="text-xs text-white/50">
              {t('drukkersZendingModalGeenBestellingen')}
            </p>
          ) : (
            orders.map((bestelling) => {
              const klant = (klanten ?? []).find((k) => k.klantnr === bestelling.klantnr);
              const land = klant ? klant.invoiceLand || klant.land || null : null;
              const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
              const totalen =
                bestelling.lines.length > 0
                  ? berekenBestellingTotalen(bestelling.lines, bestelling.korting, btwPercentage)
                  : null;
              const totaalWeergave =
                totalen === null
                  ? null
                  : totalen.heeftOngeprijsdeRegel
                    ? t('bestellingenModalTotalIncomplete')
                    : formatCurrency(totalen.totaalExclBtw!);

              return (
                <div
                  key={bestelling.id}
                  data-testid={`zending-bekijken-bestelling-${bestelling.id}`}
                  className="flex flex-col gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                    {bestelling.companyName} · {bestelling.bestelnr} · {bestelling.besteldatum}
                  </p>
                  <ul className="flex flex-col gap-2 text-xs">
                    {bestelling.lines.map((line) => {
                      const kunstwerk = (kunstwerken ?? []).find((k) => k.code === line.code) ?? null;
                      const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
                      const maat = (maten ?? []).find((m) => m.id === line.maatId);
                      const maatWeergave = maat
                        ? `${maat.breedte}×${maat.hoogte} cm`
                        : line.breedte != null && line.hoogte != null
                          ? `${line.breedte}×${line.hoogte} cm`
                          : t('bestellingenRegelOnbekend');

                      return (
                        <li
                          key={line.id}
                          data-testid={`zending-bekijken-line-${line.id}`}
                          className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                        >
                          {kunstwerk ? (
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
                            <p className="line-clamp-2 font-semibold text-white/90">
                              {kunstwerk ? kunstwerk.omschrijvingNl : t('bestellingenRegelOnbekend')}
                            </p>
                            {kunstwerk && (
                              <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-white/60">
                                <span className="text-white/35">{t('bestellingenModalLabelCode')}</span>
                                <span>{kunstwerk.code}</span>
                                <span className="text-white/35">{t('bestellingenModalLabelMateriaal')}</span>
                                <span>
                                  {materiaal
                                    ? `${materiaal.materiaaldikte}mm ${
                                        materiaalsoortNaamById.get(materiaal.materiaalsoortId) ??
                                        materiaal.materiaalsoortId
                                      } — ${materiaal.omschrijvingNl}`
                                    : t('bestellingenRegelOnbekend')}
                                </span>
                                <span className="text-white/35">{t('bestellingenModalLabelMaat')}</span>
                                <span>{maatWeergave}</span>
                              </div>
                            )}
                            <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-1.5">
                              {line.prijs !== null ? (
                                <>
                                  <span className="text-white/45">
                                    {line.quantity} × {formatCurrency(line.prijs)}
                                  </span>
                                  <span className="font-semibold text-white/90">
                                    {formatCurrency(line.prijs * line.quantity)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-white/45">{t('bestellingenModalPrijsOpAanvraag')}</span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {totaalWeergave !== null && (
                    <div className="grid grid-cols-[auto_auto] items-baseline justify-end gap-x-2 gap-y-0.5 self-end">
                      <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                        {t('bestellingenModalTotalLabel')}
                      </span>
                      <span
                        data-testid={`zending-bekijken-bestelling-${bestelling.id}-total`}
                        className="text-right text-sm font-semibold text-white tabular-nums"
                      >
                        {totaalWeergave}
                      </span>
                      {totalen && totalen.korting > 0 && (
                        <div className="contents">
                          <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                            {t('bestellingenModalKortingLabel')}
                          </span>
                          <span className="text-right text-sm text-white/80 tabular-nums">
                            -{formatCurrency(totalen.korting)}
                          </span>
                        </div>
                      )}
                      {totalen && totalen.btwBedrag !== null && (
                        <div className="contents">
                          <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                            {t('bestellingenModalBtwLabel', { percentage: totalen.btwPercentage })}
                          </span>
                          <span className="text-right text-sm text-white/80 tabular-nums">
                            {formatCurrency(totalen.btwBedrag)}
                          </span>
                        </div>
                      )}
                      {totalen && totalen.totaalInclBtw !== null && (
                        <>
                          <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                            {t('bestellingenModalTotaalInclLabel')}
                          </span>
                          <span
                            data-testid={`zending-bekijken-bestelling-${bestelling.id}-totaal-incl`}
                            className="text-right text-sm font-semibold text-white tabular-nums"
                          >
                            {formatCurrency(totalen.totaalInclBtw)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </Modal>
  );
}
