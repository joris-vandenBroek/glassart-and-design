'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCart } from '@/lib/useCart';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { formatCurrency } from '@/lib/formatCurrency';
import { WatermarkedImage } from './WatermarkedImage';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';

const CONFIRM_FEEDBACK_MS = 600;
const CUSTOM_MAAT_VALUE = '__eigen_maat__';

export function materiaalLabel(materiaal: Materiaal, materiaalsoortNaam: string): string {
  return `${materiaal.materiaaldikte}mm ${materiaalsoortNaam}`;
}

export function maatLabel(maat: Maat): string {
  return `${maat.breedte}×${maat.hoogte} cm`;
}

function withinMax(breedte: number, hoogte: number, soort: Materiaalsoort | undefined): boolean {
  if (!soort || soort.maxBreedte == null || soort.maxHoogte == null) {
    return true;
  }
  const smallest = Math.min(breedte, hoogte);
  const largest = Math.max(breedte, hoogte);
  return smallest <= soort.maxBreedte && largest <= soort.maxHoogte;
}

interface ProductModalProps {
  kunstwerk: Kunstwerk | null;
  materialen: Materiaal[] | null;
  maten: Maat[] | null;
  materiaalsoorten: Materiaalsoort[] | null;
  kunstenaars: Kunstenaar[] | null;
  onClose: () => void;
}

export function ProductModal({ kunstwerk, materialen, maten, materiaalsoorten, kunstenaars, onClose }: ProductModalProps) {
  const t = useTranslations('cart');
  const locale = useLocale();
  const [materiaalId, setMateriaalId] = useState('');
  const [maatId, setMaatId] = useState('');
  const [customBreedte, setCustomBreedte] = useState('');
  const [customHoogte, setCustomHoogte] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const { addItem } = useCart();
  const { user } = useCustomerAuth();
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!kunstwerk) {
      return;
    }
    setMateriaalId(kunstwerk.materiaalIds[0] ?? '');
    setMaatId(kunstwerk.maatIds[0] ?? '');
    setCustomBreedte('');
    setCustomHoogte('');
    setQuantity(1);
    setIsConfirmed(false);
  }, [kunstwerk]);

  // Ensure a pending "close after confirm" timer never fires for a stale
  // kunstwerk: clear it whenever `kunstwerk` changes, and on unmount.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [kunstwerk]);

  useOverlayDismiss({
    isOpen: kunstwerk !== null,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!kunstwerk) {
    return null;
  }

  const kunstenaar = kunstwerk.kunstenaarId
    ? (kunstenaars ?? []).find((item) => item.id === kunstwerk.kunstenaarId) ?? null
    : null;
  const isOwnArtwork = kunstenaar?.klantId != null && kunstenaar.klantId === user?.uid;
  const isExclusiveToOther = kunstenaar?.exclusiefVoorKlantId != null && kunstenaar.exclusiefVoorKlantId !== user?.uid;
  const isArtistOnlyForOthers = kunstenaar?.verkooprecht === 'alleen-kunstenaar' && !isOwnArtwork;
  const canOrder = !kunstenaar || isOwnArtwork || (!isExclusiveToOther && !isArtistOnlyForOthers);
  const blockedReason: 'exclusive' | 'artistOnly' | null = canOrder ? null : isExclusiveToOther ? 'exclusive' : 'artistOnly';

  const beschikbareMaterialen = (materialen ?? []).filter((materiaal) =>
    kunstwerk.materiaalIds.includes(materiaal.id)
  );
  const beschikbareMaten = (maten ?? []).filter((maat) => kunstwerk.maatIds.includes(maat.id));
  const materiaalsoortNaamById = new Map(
    (materiaalsoorten ?? []).map((soort) => [soort.id, soort.omschrijving])
  );
  function resolvedMateriaalLabel(materiaal: Materiaal): string {
    return materiaalLabel(materiaal, materiaalsoortNaamById.get(materiaal.materiaalsoortId) ?? materiaal.materiaalsoortId);
  }
  const geselecteerdMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
  const geselecteerdSoort = (materiaalsoorten ?? []).find(
    (soort) => soort.id === geselecteerdMateriaal?.materiaalsoortId
  );
  const isCustomSize = maatId === CUSTOM_MAAT_VALUE;
  const prijsRegel = !isCustomSize
    ? kunstwerk.prijzen.find((regel) => regel.materiaalId === materiaalId && regel.maatId === maatId)
    : undefined;
  const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);

  const customBreedteNum = Number(customBreedte);
  const customHoogteNum = Number(customHoogte);
  const customSizeFilledIn =
    customBreedte !== '' && customHoogte !== '' && customBreedteNum > 0 && customHoogteNum > 0;
  const customSizeExceedsMax = customSizeFilledIn && !withinMax(customBreedteNum, customHoogteNum, geselecteerdSoort);
  const customSizeValid = customSizeFilledIn && !customSizeExceedsMax;

  const canConfirm = isCustomSize ? customSizeValid : Boolean(prijsRegel);

  function handleMateriaalChange(nextMateriaalId: string) {
    setMateriaalId(nextMateriaalId);
    const nextMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === nextMateriaalId);
    const nextSoort = (materiaalsoorten ?? []).find((soort) => soort.id === nextMateriaal?.materiaalsoortId);
    if (isCustomSize && !nextSoort?.staatEigenMaatToe) {
      setMaatId(beschikbareMaten[0]?.id ?? '');
    }
  }

  function handleConfirm() {
    if (isConfirmed || !canConfirm || !kunstwerk) {
      return;
    }
    const gekozenMateriaal = beschikbareMaterialen.find((materiaal) => materiaal.id === materiaalId);
    if (!gekozenMateriaal) {
      return;
    }
    if (isCustomSize) {
      addItem({
        kunstwerkId: kunstwerk.id,
        foto: kunstwerk.foto,
        omschrijving,
        materiaalId,
        materiaalLabel: resolvedMateriaalLabel(gekozenMateriaal),
        maatId: '',
        maatLabel: `${customBreedteNum}×${customHoogteNum} cm${t('customSizeSuffix')}`,
        breedte: customBreedteNum,
        hoogte: customHoogteNum,
        prijs: null,
        quantity,
      });
      void logActiviteit('mandje_eigen_maat_toegevoegd', actorFromCustomer(user));
    } else {
      const gekozenMaat = beschikbareMaten.find((maat) => maat.id === maatId);
      if (!gekozenMaat || !prijsRegel) {
        return;
      }
      addItem({
        kunstwerkId: kunstwerk.id,
        foto: kunstwerk.foto,
        omschrijving,
        materiaalId,
        materiaalLabel: resolvedMateriaalLabel(gekozenMateriaal),
        maatId,
        maatLabel: maatLabel(gekozenMaat),
        prijs: prijsRegel.prijs,
        quantity,
      });
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
    }
    setIsConfirmed(true);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, CONFIRM_FEEDBACK_MS);
  }

  return (
    <div
      ref={modalRef}
      data-testid="product-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        data-testid="product-modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div className="relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal sm:grid-cols-2">
        <button
          ref={closeButtonRef}
          type="button"
          data-testid="product-modal-close"
          aria-label={t('close')}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
        >
          ×
        </button>
        <WatermarkedImage src={kunstwerk.foto} alt={omschrijving} className="h-56 w-full sm:h-full" />
        <div className="flex flex-col gap-4 p-6">
          <p data-testid="product-modal-omschrijving" className="text-sm leading-relaxed text-white/80">
            {omschrijving}
          </p>
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('material')}
            <select
              data-testid="product-modal-materiaal"
              value={materiaalId}
              onChange={(event) => handleMateriaalChange(event.target.value)}
              className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
            >
              {beschikbareMaterialen.map((materiaal) => (
                <option key={materiaal.id} value={materiaal.id}>
                  {resolvedMateriaalLabel(materiaal)}
                </option>
              ))}
            </select>
            {geselecteerdMateriaal && (
              <span
                data-testid="product-modal-materiaal-omschrijving"
                className="pt-1 text-[0.7rem] normal-case tracking-normal text-white/50"
              >
                {geselecteerdMateriaal.omschrijving}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
            {t('size')}
            <select
              data-testid="product-modal-maat"
              value={maatId}
              onChange={(event) => setMaatId(event.target.value)}
              className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
            >
              {beschikbareMaten.map((maat) => (
                <option key={maat.id} value={maat.id}>
                  {maatLabel(maat)}
                </option>
              ))}
              {geselecteerdSoort?.staatEigenMaatToe && (
                <option value={CUSTOM_MAAT_VALUE}>{t('customSizeOption')}</option>
              )}
            </select>
          </label>
          {isCustomSize && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                  {t('customWidthLabel')}
                  <input
                    type="number"
                    data-testid="product-modal-maat-custom-breedte"
                    value={customBreedte}
                    onChange={(event) => setCustomBreedte(event.target.value)}
                    className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[0.65rem] uppercase tracking-wide text-white/60">
                  {t('customHeightLabel')}
                  <input
                    type="number"
                    data-testid="product-modal-maat-custom-hoogte"
                    value={customHoogte}
                    onChange={(event) => setCustomHoogte(event.target.value)}
                    className="rounded-sm bg-black/40 px-2 py-1.5 text-sm text-white"
                  />
                </label>
              </div>
              {customSizeExceedsMax && (
                <p data-testid="product-modal-maat-custom-error" className="text-xs text-red-400">
                  {t('customSizeMaxError', {
                    maxBreedte: geselecteerdSoort?.maxBreedte ?? 0,
                    maxHoogte: geselecteerdSoort?.maxHoogte ?? 0,
                  })}
                </p>
              )}
              {Boolean(geselecteerdSoort?.levertijdMaandenEigenMaat) && (
                <p data-testid="product-modal-maat-levertijd-warning" className="text-xs text-amber-400">
                  {t('customSizeLeadTime', { months: geselecteerdSoort?.levertijdMaandenEigenMaat ?? 0 })}
                </p>
              )}
            </div>
          )}
          {isCustomSize ? (
            <p data-testid="product-modal-prijs" className="text-sm text-white/80">
              {t('priceOnRequest')}
            </p>
          ) : (
            prijsRegel && (
              <p data-testid="product-modal-prijs" className="text-sm text-white/80">
                {formatCurrency(prijsRegel.prijs)}
              </p>
            )
          )}
          <div className="flex items-center justify-between gap-2 text-sm text-white/80">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/60">{t('quantity')}</span>
            <div className="flex h-10 items-center overflow-hidden rounded-full border border-white/20">
              <button
                type="button"
                data-testid="product-modal-quantity-minus"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                −
              </button>
              <span data-testid="product-modal-quantity-value" className="w-9 text-center">
                {quantity}
              </span>
              <button
                type="button"
                data-testid="product-modal-quantity-plus"
                onClick={() => setQuantity((current) => current + 1)}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                +
              </button>
            </div>
          </div>
          {blockedReason && (
            <p data-testid="product-modal-order-blocked" className="text-xs text-amber-400">
              {blockedReason === 'exclusive' ? t('orderBlockedExclusive') : t('orderBlockedArtistOnly')}
            </p>
          )}
          <button
            type="button"
            data-testid="product-modal-confirm"
            onClick={handleConfirm}
            disabled={isConfirmed || !canConfirm || !canOrder}
            className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition disabled:opacity-40 ${
              isConfirmed ? 'cursor-default bg-green-500 text-white' : 'btn-gold'
            }`}
          >
            {isConfirmed ? t('added') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
