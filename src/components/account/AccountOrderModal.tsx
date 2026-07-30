'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal';
import { ProductImage } from '@/components/ProductImage';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { formatCurrency } from '@/lib/formatCurrency';
import type { DisplayOrder } from '@/lib/useAllOrders';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';

function materiaalLabel(materiaal: Materiaal): string {
  return `${materiaal.materiaaldikte}mm — ${materiaal.omschrijving}`;
}

function maatLabel(maat: Maat): string {
  return `${maat.breedte}×${maat.hoogte} cm`;
}

interface AccountOrderModalProps {
  order: DisplayOrder | null;
  kunstwerken: Kunstwerk[] | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  onClose: () => void;
}

export function AccountOrderModal({
  order,
  kunstwerken,
  materialen,
  maten,
  onClose,
}: AccountOrderModalProps) {
  const t = useTranslations('accountPage.orders');
  const locale = useLocale();

  return (
    <Modal
      isOpen={order !== null}
      onClose={onClose}
      closeLabel={t('modalClose')}
      title={order ? t('modalTitel', { id: order.id }) : ''}
    >
      {order && (
        <div data-testid="account-order-modal" className="flex flex-col gap-3 text-sm text-white/80">
          <p className="font-medium">{order.id}</p>
          <p className="text-white/60">
            {order.date} {order.time}
          </p>

          {order.lines && order.lines.length > 0 ? (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto text-xs">
              {order.lines.map((line) => {
                const kunstwerk = (kunstwerken ?? []).find((k) => k.id === line.kunstwerkId);
                const materiaal = (materialen ?? []).find((m) => m.id === line.materiaalId);
                const maat = (maten ?? []).find((m) => m.id === line.maatId);
                return (
                  <li
                    key={line.id}
                    data-testid={`account-order-modal-line-${line.id}`}
                    className="flex items-center justify-between gap-2"
                  >
                    {kunstwerk ? (
                      <div className="flex items-center gap-2">
                        <ProductImage src={kunstwerk.foto} alt="" className="h-10 w-10 rounded" />
                        <div>
                          <p>{resolveKunstwerkOmschrijving(kunstwerk, locale)}</p>
                          <p className="text-white/50">
                            {materiaal ? materiaalLabel(materiaal) : line.materiaalId}
                            {' · '}
                            {maat
                              ? maatLabel(maat)
                              : line.breedte != null && line.hoogte != null
                                ? `${line.breedte}×${line.hoogte} cm`
                                : line.maatId}
                            {' · '}
                            {line.prijs !== null ? formatCurrency(line.prijs) : t('modalLinePriceOnRequest')}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span>{t('modalLineUnknown')}</span>
                    )}
                    <span>×{line.quantity}</span>
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
