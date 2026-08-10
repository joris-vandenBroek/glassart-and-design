'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { ProductImage } from '@/components/ProductImage';
import { HelpHint } from '@/components/HelpHint';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { resolveOmschrijving } from '@/lib/resolveOmschrijving';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveBtwPercentage } from '@/lib/resolveBtw';
import {
  toKlantBestellingStatus,
  KLANT_STATUS_BADGE_CLASS,
  KLANT_STATUS_TRANSLATION_KEY,
} from '@/lib/klantBestellingStatus';
import type { DisplayOrder } from '@/lib/useAllOrders';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';

function materiaalLabel(materiaal: Materiaal, locale: string): string {
  return `${materiaal.materiaaldikte}mm — ${resolveOmschrijving(materiaal, locale)}`;
}

function maatLabel(maat: Maat): string {
  return `${maat.breedte}×${maat.hoogte} cm`;
}

interface AccountOrderModalProps {
  order: DisplayOrder | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  land: string | null;
  btwTarieven: BtwTarieven | null;
  onClose: () => void;
}

export function AccountOrderModal({
  order,
  kunstwerken,
  materialen,
  maten,
  land,
  btwTarieven,
  onClose,
}: AccountOrderModalProps) {
  const t = useTranslations('accountPage.orders');
  const locale = useLocale();
  const klantStatus = order ? toKlantBestellingStatus(order.status) : null;

  const heeftRegels = !!order?.lines && order.lines.length > 0;
  const heeftOngeprijsdeRegel = heeftRegels && order!.lines!.some((line) => line.prijs === null);
  const totaalWeergave = !heeftRegels
    ? null
    : heeftOngeprijsdeRegel
      ? t('modalTotalIncomplete')
      : formatCurrency(order!.lines!.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0));

  const totaalExclBtwGetal =
    heeftRegels && !heeftOngeprijsdeRegel
      ? order!.lines!.reduce((sum, line) => sum + (line.prijs ?? 0) * line.quantity, 0)
      : null;
  const btwPercentage = btwTarieven ? resolveBtwPercentage(btwTarieven.tarieven, land) : null;
  const btwBedrag =
    totaalExclBtwGetal !== null && btwPercentage != null ? totaalExclBtwGetal * (btwPercentage / 100) : null;
  const totaalInclBtw = totaalExclBtwGetal !== null && btwBedrag !== null ? totaalExclBtwGetal + btwBedrag : null;

  return (
    <Modal
      isOpen={order !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={order ? t('modalTitel', { id: order.id }) : ''}
      subtitle={
        order ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col items-start gap-1">
              <span>
                {order.date} {order.time}
              </span>
              <div className="flex items-center gap-2">
                <span
                  data-testid="account-order-modal-status"
                  className={`w-fit rounded-full px-3 py-1 text-xs uppercase tracking-wide ${KLANT_STATUS_BADGE_CLASS[klantStatus!]}`}
                >
                  {t(KLANT_STATUS_TRANSLATION_KEY[klantStatus!])}
                </span>
                <HelpHint text={t('statusHelp')} size="sm" testId="account-order-modal-status-help" />
              </div>
            </div>
            {totaalWeergave !== null && (
              <div className="grid shrink-0 grid-cols-[auto_auto] items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[0.65rem] uppercase tracking-wide text-white/40">{t('modalTotalLabel')}</span>
                <span
                  data-testid="account-order-modal-total"
                  className="text-right text-sm font-semibold text-white tabular-nums"
                >
                  {totaalWeergave}
                </span>
                {btwBedrag !== null && (
                  <div data-testid="account-order-modal-btw" className="contents">
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('modalBtwLabel', { percentage: btwPercentage })}
                    </span>
                    <span className="text-right text-sm text-white/80 tabular-nums">{formatCurrency(btwBedrag)}</span>
                  </div>
                )}
                {totaalInclBtw !== null && (
                  <>
                    <span className="text-[0.65rem] uppercase tracking-wide text-white/40">
                      {t('modalTotaalInclLabel')}
                    </span>
                    <span
                      data-testid="account-order-modal-totaal-incl"
                      className="text-right text-sm font-semibold text-white tabular-nums"
                    >
                      {formatCurrency(totaalInclBtw)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      {order && (
        <div data-testid="account-order-modal" className="flex flex-col gap-3 text-sm text-white/80">
          {heeftRegels ? (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto text-xs">
              {order.lines!.map((line) => {
                const kunstwerk = (kunstwerken ?? []).find((k) => k.code === line.code);
                const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
                const maat = (maten ?? []).find((m) => m.id === line.maatId);
                const maatWeergave = maat
                  ? maatLabel(maat)
                  : line.breedte != null && line.hoogte != null
                    ? `${line.breedte}×${line.hoogte} cm`
                    : line.maatId;

                return (
                  <li
                    key={line.id}
                    data-testid={`account-order-modal-line-${line.id}`}
                    className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                  >
                    {kunstwerk ? (
                      <ProductImage src={kunstwerk.foto} alt="" className="h-[72px] w-[72px] shrink-0 rounded-md" />
                    ) : (
                      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-md bg-white/5 text-lg text-white/25">
                        ?
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {kunstwerk ? (
                        <>
                          <p className="line-clamp-2 font-semibold text-white/90">
                            {resolveKunstwerkOmschrijving(kunstwerk, locale)}
                          </p>
                          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[0.68rem] text-white/60">
                            <span className="text-white/35">{t('modalLabelMateriaal')}</span>
                            <span>{materiaal ? materiaalLabel(materiaal, locale) : line.materiaalId}</span>
                            <span className="text-white/35">{t('modalLabelMaat')}</span>
                            <span>{maatWeergave}</span>
                          </div>
                        </>
                      ) : (
                        <p className="font-semibold text-white/90">{t('modalLineUnknown')}</p>
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
                          <span className="flex items-center gap-2 text-white/45">
                            {t('modalLinePriceOnRequest')}
                            <HelpHint
                              text={t('priceOnRequestHelp')}
                              size="sm"
                              testId={`account-order-modal-line-${line.id}-price-help`}
                            />
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-white/70">{order.description}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
