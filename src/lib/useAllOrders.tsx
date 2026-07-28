'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { formatOrderDateTime } from '@/lib/formatOrderDateTime';
import { useCustomerAuth } from './useCustomerAuth';

export interface DisplayOrderLine {
  id: string;
  kunstwerkId: string | null;
  maatId: string | null;
  materiaalId: string | null;
  breedte?: number;
  hoogte?: number;
  prijs: number | null;
  quantity: number;
}

export interface DisplayOrder {
  id: string;
  date: string;
  time: string;
  description: string;
  lines: DisplayOrderLine[] | null;
}

interface RealOrder {
  id: string;
  date: Date | null;
  lineCount: number;
  totalQuantity: number;
  lines: DisplayOrderLine[];
}

export interface UseAllOrdersResult {
  orders: DisplayOrder[];
  loadError: boolean;
}

export function useAllOrders(): UseAllOrdersResult {
  const tAccount = useTranslations('accountPage');
  const { user } = useCustomerAuth();
  const [realOrders, setRealOrders] = useState<RealOrder[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) {
      setRealOrders([]);
      setLoadError(false);
      return;
    }
    let cancelled = false;
    async function loadRealOrders() {
      setLoadError(false);
      try {
        const response = await fetch(`/api/bestelheaders?klantId=${user!.uid}`);
        if (!response.ok) throw new Error('load failed');
        const headers = (await response.json()) as Array<{
          id: string;
          bestelnr: string;
          besteldatum: string;
          lines: Array<{
            id: string;
            kunstwerkId: string | null;
            maatId: string | null;
            materiaalId: string | null;
            breedte?: number;
            hoogte?: number;
            prijs: number | null;
            quantity: number;
          }>;
        }>;
        const orders = headers.map((header) => ({
          id: header.bestelnr ?? header.id,
          date: header.besteldatum ? new Date(header.besteldatum) : null,
          lineCount: header.lines.length,
          totalQuantity: header.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
          lines: header.lines,
        }));
        if (!cancelled) {
          setRealOrders(orders);
        }
      } catch {
        if (!cancelled) {
          setRealOrders([]);
          setLoadError(true);
        }
      }
    }
    loadRealOrders();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const orders = useMemo(() => {
    return realOrders.map((order) => {
      const { date, time } = order.date
        ? formatOrderDateTime(order.date)
        : { date: '', time: '' };
      return {
        id: order.id,
        date,
        time,
        description: tAccount('orders.lineSummary', {
          lines: order.lineCount,
          quantity: order.totalQuantity,
        }),
        lines: order.lines,
      };
    });
  }, [realOrders, tAccount]);

  return useMemo(() => ({ orders, loadError }), [orders, loadError]);
}
