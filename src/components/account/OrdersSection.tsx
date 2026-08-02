'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAllOrders, type DisplayOrder } from '@/lib/useAllOrders';
import { useApiCollection } from '@/lib/useApiCollection';
import { toKlantBestellingStatus, KLANT_STATUS_BADGE_CLASS } from '@/lib/klantBestellingStatus';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import { AccountOrderModal } from './AccountOrderModal';

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
                className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs text-white/80 hover:bg-white/5"
              >
                <span className="font-medium">{order.id}</span>
                <span className="flex-1 truncate px-3 text-white/60">{order.description}</span>
                <span
                  data-testid={`account-order-${order.id}-status`}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-wide ${KLANT_STATUS_BADGE_CLASS[klantStatus]}`}
                >
                  {klantStatus === 'afgewezen' ? t('orders.statusAfgewezen') : t('orders.statusInBehandeling')}
                </span>
                <span className="whitespace-nowrap text-white/50">
                  {order.date} {order.time}
                </span>
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
