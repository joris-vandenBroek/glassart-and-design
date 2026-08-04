'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAllOrders, type DisplayOrder, type DisplayOrderLine } from '@/lib/useAllOrders';
import { useApiCollection } from '@/lib/useApiCollection';
import { ProductImage } from '@/components/ProductImage';
import {
  toKlantBestellingStatus,
  KLANT_STATUS_BADGE_CLASS,
  KLANT_STATUS_TRANSLATION_KEY,
} from '@/lib/klantBestellingStatus';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import { AccountOrderModal } from './AccountOrderModal';

const MAX_VISIBLE_THUMBNAILS = 3;

type OrderThumbnail =
  | { key: string; kind: 'kunstwerk'; foto: string }
  | { key: string; kind: 'unknown' }
  | { key: 'overflow'; kind: 'overflow'; overflowCount: number };

function resolveOrderThumbnails(
  lines: DisplayOrderLine[] | null,
  kunstwerken: Kunstwerk[] | null
): OrderThumbnail[] {
  if (!lines || lines.length === 0) return [];
  if (kunstwerken === null) return [];

  const uniqueIds = Array.from(
    new Set(lines.map((line) => line.kunstwerkId).filter((id): id is string => id !== null))
  );

  if (uniqueIds.length === 0) {
    return [{ key: 'unknown', kind: 'unknown' }];
  }

  const shown: OrderThumbnail[] = uniqueIds.slice(0, MAX_VISIBLE_THUMBNAILS).map((id) => {
    const kunstwerk = (kunstwerken ?? []).find((k) => k.id === id);
    return kunstwerk ? { key: id, kind: 'kunstwerk', foto: kunstwerk.foto } : { key: id, kind: 'unknown' };
  });

  if (uniqueIds.length > MAX_VISIBLE_THUMBNAILS) {
    shown[MAX_VISIBLE_THUMBNAILS - 1] = {
      key: 'overflow',
      kind: 'overflow',
      overflowCount: uniqueIds.length - (MAX_VISIBLE_THUMBNAILS - 1),
    };
  }

  return shown;
}

function OrderThumbnailStack({ orderId, thumbnails }: { orderId: string; thumbnails: OrderThumbnail[] }) {
  if (thumbnails.length === 0) return null;
  return (
    <div data-testid={`account-order-${orderId}-thumbnails`} className="flex shrink-0">
      {thumbnails.map((thumb, index) => (
        <div
          key={thumb.key}
          className={`h-9 w-9 shrink-0 overflow-hidden rounded-md ring-1 ring-charcoal ${index > 0 ? '-ml-3' : ''}`}
        >
          {thumb.kind === 'kunstwerk' ? (
            <ProductImage src={thumb.foto} alt="" className="h-full w-full" />
          ) : thumb.kind === 'overflow' ? (
            <div className="flex h-full w-full items-center justify-center bg-white/10 text-[0.6rem] text-white/60">
              +{thumb.overflowCount}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs text-white/25">?</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function OrdersSection() {
  const t = useTranslations('accountPage');
  const { orders, loadError } = useAllOrders();
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken');
  const materialen = useApiCollection<Materiaal>('materialen');
  const maten = useApiCollection<Maat>('maten');
  const [selectedOrder, setSelectedOrder] = useState<DisplayOrder | null>(null);

  return (
    <div data-testid="orders-section">
      <p className="mb-3 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
        {t('navOrders')}
      </p>
      {loadError && (
        <p data-testid="orders-load-error" className="mb-3 text-xs text-red-400">
          {t('orders.loadError')}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {orders.map((order) => {
          const klantStatus = toKlantBestellingStatus(order.status);
          return (
            <li key={order.id}>
              <button
                type="button"
                data-testid={`account-order-${order.id}`}
                onClick={() => setSelectedOrder(order)}
                className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-xs text-white/80 hover:bg-white/5"
              >
                <OrderThumbnailStack
                  orderId={order.id}
                  thumbnails={resolveOrderThumbnails(order.lines, kunstwerken.items)}
                />
                <div
                  data-testid={`account-order-${order.id}-row`}
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-3"
                >
                  <span className="col-start-1 row-start-1 font-medium sm:col-start-1 sm:row-start-1">
                    {order.id}
                  </span>
                  <span
                    data-testid={`account-order-${order.id}-status`}
                    className={`col-start-2 row-start-1 w-fit shrink-0 justify-self-end rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-wide sm:col-start-3 sm:row-start-1 sm:justify-self-auto ${KLANT_STATUS_BADGE_CLASS[klantStatus]}`}
                  >
                    {t(`orders.${KLANT_STATUS_TRANSLATION_KEY[klantStatus]}`)}
                  </span>
                  <span className="col-start-1 row-start-2 min-w-0 truncate text-white/60 sm:col-start-2 sm:row-start-1">
                    {order.description}
                  </span>
                  <span className="col-start-2 row-start-2 whitespace-nowrap text-white/50 sm:col-start-4 sm:row-start-1">
                    {order.date} {order.time}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <AccountOrderModal
        order={selectedOrder}
        kunstwerken={kunstwerken.items}
        materialen={materialen.items}
        maten={maten.items}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
