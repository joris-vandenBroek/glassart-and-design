'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useCart } from '@/lib/useCart';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { useApiCollection } from '@/lib/useApiCollection';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveOrderRight } from '@/lib/resolveOrderRight';
import { ProductImage } from './ProductImage';
import { Link } from '@/i18n/navigation';
import { logActiviteit } from '@/lib/logActiviteit';
import type { Kunstwerk } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';

export function CartPanel() {
  const t = useTranslations('cart');
  const [isOpen, setIsOpen] = useState(false);
  const [placeOrderError, setPlaceOrderError] = useState<string | null>(null);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const { items, isHydrated, totalQuantity, totalPrice, unpricedLineCount, removeItem, clear } = useCart();
  const { user, isCustomer } = useCustomerAuth();
  // Het mandje leeft in localStorage en kan dagen oud zijn; de exclusiviteit wordt
  // daarom vlak vóór het plaatsen opnieuw uit de actuele collecties gelezen. Alleen voor
  // goedgekeurde klanten: dit paneel hangt in de navigatie van élke pagina, en niemand
  // anders kan een bestelling plaatsen. `skip` haalt de collecties alsnog op zodra de
  // klantstatus binnen is.
  const kunstwerken = useApiCollection<Kunstwerk>('kunstwerken', { skip: !isCustomer });
  const kunstenaars = useApiCollection<Kunstenaar>('kunstenaars', { skip: !isCustomer });
  const bestelControleGereed = kunstwerken.items !== null && kunstenaars.items !== null;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function handleClose() {
    setIsOpen(false);
    setOrderPlaced(false);
    setEmailError(false);
  }

  useOverlayDismiss({
    isOpen,
    onClose: handleClose,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
  });

  async function handlePlaceOrder() {
    if (!user) {
      return;
    }
    setPlaceOrderError(null);
    setEmailError(false);
    // Een mislukte lees is een technisch probleem, geen uitspraak over dit artikel — anders
    // krijgt de klant "niet meer beschikbaar" te zien voor iets wat gewoon bestelbaar is.
    if (kunstwerken.error === 'load' || kunstenaars.error === 'load') {
      setPlaceOrderError(t('placeOrderError'));
      return;
    }
    // Vóór de header, niet erna: `bestelheaders/{id}` mag niet verwijderd worden, dus een
    // regel die door de server-side controle geweigerd wordt zou een half geschreven bestelling
    // achterlaten die niemand nog kan opruimen.
    const blockedItem = items.find((item) => {
      const kunstwerk = (kunstwerken.items ?? []).find((kw) => kw.id === item.kunstwerkId);
      if (!kunstwerk) return true; // huidige staat niet te controleren — behandel als geblokkeerd
      return !resolveOrderRight(kunstwerk.kunstenaarnr, kunstenaars.items, user.uid).canOrder;
    });
    if (blockedItem) {
      setPlaceOrderError(t('placeOrderBlockedItem', { omschrijving: blockedItem.omschrijving }));
      return;
    }
    try {
      const response = await fetch('/api/bestelheaders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          klantId: user.uid,
          lines: items.map((item) => ({
            kunstwerkId: item.kunstwerkId,
            maatId: item.maatId,
            materiaalId: item.materiaalId,
            prijs: item.prijs,
            quantity: item.quantity,
            ...(item.breedte != null ? { breedte: item.breedte } : {}),
            ...(item.hoogte != null ? { hoogte: item.hoogte } : {}),
          })),
        }),
      });
      if (!response.ok) throw new Error('order failed');
      const { bestelnr } = await response.json();
      clear();
      setOrderPlaced(true);
      void logActiviteit('bestelling_geplaatst', bestelnr);
      if (user.email) {
        void sendConfirmationEmail();
      }
    } catch {
      setPlaceOrderError(t('placeOrderError'));
    }
  }

  // De ontvanger staat bewust niet meer in de request: /api/mail stuurt een
  // bestelbevestiging altijd naar het e-mailadres van de ingelogde klant zelf.
  async function sendConfirmationEmail() {
    try {
      const response = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soort: 'bestelbevestiging',
          subject: t('orderEmailSubject'),
          body: t('orderConfirmation'),
        }),
      });
      if (!response.ok) {
        setEmailError(true);
      }
    } catch {
      // Best-effort -- the order itself already succeeded, so
      // this only surfaces a soft warning rather than blocking the order.
      setEmailError(true);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="cart-icon"
        aria-label={t('title')}
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:text-white"
      >
        <span aria-hidden="true">🛒</span>
        {isHydrated && totalQuantity > 0 && (
          <span
            data-testid="cart-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-silver px-1 text-[0.6rem] font-semibold text-ink"
          >
            {totalQuantity}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <>
            <div
              data-testid="cart-backdrop"
              onClick={handleClose}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <div
              ref={panelRef}
              data-testid="cart-panel"
              role="dialog"
              aria-modal="true"
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[400px] flex-col border-l border-white/10 bg-charcoal"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <p className="font-head text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
                  {t('title')}
                </p>
                <button
                  ref={closeButtonRef}
                  type="button"
                  data-testid="cart-close"
                  aria-label={t('close')}
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {orderPlaced ? (
                  <div className="flex flex-col gap-2">
                    <p data-testid="cart-order-confirmation" className="text-center text-xs text-white/80">
                      {t('orderConfirmation')}
                    </p>
                    {emailError && (
                      <p data-testid="cart-order-email-error" className="text-center text-xs text-amber-400">
                        {t('emailError')}
                      </p>
                    )}
                  </div>
                ) : items.length === 0 ? (
                  <p data-testid="cart-empty" className="text-center text-xs text-white/60">
                    {t('empty')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        data-testid={`cart-item-${item.id}`}
                        className="flex gap-3 rounded-md border border-white/10 bg-graphite/60 p-3 text-xs text-white/80"
                      >
                        <ProductImage src={item.foto} alt="" className="h-12 w-12 rounded" />
                        <div className="flex-1">
                          <p>{item.omschrijving}</p>
                          <p className="text-white/50">
                            {item.materiaalLabel} · {item.maatLabel} · ×{item.quantity}
                          </p>
                          <p className="text-white/50">
                            {item.prijs !== null ? formatCurrency(item.prijs * item.quantity) : t('priceOnRequest')}
                          </p>
                        </div>
                        <button
                          type="button"
                          data-testid={`cart-item-remove-${item.id}`}
                          onClick={() => removeItem(item.id)}
                          aria-label={t('remove')}
                          className="text-white/50 hover:text-white"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {!orderPlaced && (
                <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-4">
                  {items.length > 0 && (
                    <p data-testid="cart-total" className="flex justify-between text-sm text-white/80">
                      <span>{t('total')}</span>
                      <span>{formatCurrency(totalPrice)}</span>
                    </p>
                  )}
                  {unpricedLineCount > 0 && (
                    <p data-testid="cart-unpriced-note" className="text-xs text-white/60">
                      {t('customSizeNote', { count: unpricedLineCount })}
                    </p>
                  )}
                  {isCustomer ? (
                    <button
                      type="button"
                      data-testid="cart-place-order"
                      disabled={items.length === 0 || !bestelControleGereed}
                      onClick={handlePlaceOrder}
                      className="btn-gold w-full rounded-sm px-3 py-2.5 text-center text-xs font-head tracking-wide disabled:opacity-40"
                    >
                      {t('placeOrder')}
                    </button>
                  ) : (
                    <Link
                      href="/inloggen"
                      data-testid="cart-login-to-order"
                      className="btn-gold block w-full rounded-sm px-3 py-2.5 text-center text-xs font-head tracking-wide"
                    >
                      {t('loginToOrder')}
                    </Link>
                  )}
                  {placeOrderError && (
                    <p data-testid="cart-place-order-error" className="text-center text-xs text-red-400">
                      {placeOrderError}
                    </p>
                  )}
                  <button
                    type="button"
                    data-testid="cart-clear"
                    disabled={items.length === 0}
                    onClick={clear}
                    className="text-xs text-white/50 transition hover:text-red-400 disabled:opacity-40"
                  >
                    {t('clearOrder')}
                  </button>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
