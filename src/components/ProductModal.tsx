'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCart } from '@/lib/useCart';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { logActiviteit, actorFromCustomer } from '@/lib/logActiviteit';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
import { resolveKunstwerkOmschrijving } from '@/lib/resolveKunstwerkOmschrijving';
import { resolveOrderRight } from '@/lib/resolveOrderRight';
import { formatCurrency } from '@/lib/formatCurrency';
import { findVeiligheidsglasMateriaalId, MATERIAALLOOS_LABEL } from '@/lib/kunstwerkMateriaal';
import { useFirestoreDocument } from '@/lib/useFirestoreDocument';
import { WatermarkedImage } from './WatermarkedImage';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Segment, Stijl, Onderwerp } from './beheer/materiaalTypes';
import type { Kunstenaar } from './beheer/kunstenaarTypes';
import type { Bestelinstellingen } from './beheer/bestelinstellingenTypes';

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
  segmenten: Segment[] | null;
  stijlen: Stijl[] | null;
  onderwerpen: Onderwerp[] | null;
  onClose: () => void;
  variant?: 'dialog' | 'preview';
}

export function ProductModal({
  kunstwerk,
  materialen,
  maten,
  materiaalsoorten,
  kunstenaars,
  segmenten,
  stijlen,
  onderwerpen,
  onClose,
  variant = 'dialog',
}: ProductModalProps) {
  const t = useTranslations('cart');
  const locale = useLocale();
  const [materiaalId, setMateriaalId] = useState('');
  const [maatId, setMaatId] = useState('');
  const [customBreedte, setCustomBreedte] = useState('');
  const [customHoogte, setCustomHoogte] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const { addItem } = useCart();
  const { user } = useCustomerAuth();
  const { data: bestelinstellingen } = useFirestoreDocument<Bestelinstellingen>(
    'instellingen',
    'bestelinstellingen'
  );
  const effectiveMinimum = user?.minimaleAfname ?? bestelinstellingen?.minimaleAfname ?? 1;
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!kunstwerk) {
      return;
    }
    const veiligheidsglasId = findVeiligheidsglasMateriaalId(materialen ?? [], materiaalsoorten ?? []);
    const defaultMateriaalId =
      veiligheidsglasId && kunstwerk.materiaalIds.includes(veiligheidsglasId)
        ? veiligheidsglasId
        : kunstwerk.materiaalIds[0] ?? '';
    setMateriaalId(defaultMateriaalId);
    setMaatId(kunstwerk.maatIds[0] ?? '');
    setCustomBreedte('');
    setCustomHoogte('');
    // Deliberately excludes effectiveMinimum (derived from useFirestoreDocument/
    // useCustomerAuth): those resolve well before a customer opens the popup in
    // practice, and re-running this reset whenever effectiveMinimum changes would
    // also clobber materiaal/maat selections the customer already made. materialen/
    // materiaalsoorten ARE included since the default-materiaal lookup above reads them.
    setQuantityInput(String(effectiveMinimum));
    setIsConfirmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunstwerk?.id, materialen, materiaalsoorten]);

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
    isOpen: variant === 'dialog' && kunstwerk !== null,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!kunstwerk) {
    return null;
  }

  // Dezelfde helper als CartPanel gebruikt bij het plaatsen van de bestelling, zodat de
  // UI-blokkade niet uit de pas kan lopen met de controle vlak vóór het wegschrijven.
  const { canOrder, blockedReason } = resolveOrderRight(kunstwerk.kunstenaarId, kunstenaars, user?.uid);

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
  const isMateriaalloos = kunstwerk.materiaalIds.length === 0;
  const prijsRegel = !isCustomSize
    ? kunstwerk.prijzen.find((regel) => regel.materiaalId === materiaalId && regel.maatId === maatId)
    : undefined;
  const omschrijving = resolveKunstwerkOmschrijving(kunstwerk, locale);

  const artiestNaam = kunstwerk.kunstenaarId
    ? (kunstenaars ?? []).find((kunstenaar) => kunstenaar.id === kunstwerk.kunstenaarId)?.naam ?? ''
    : '';
  const collectieLabels = kunstwerk.segmentIds.map(
    (segmentId) => (segmenten ?? []).find((segment) => segment.id === segmentId)?.omschrijving ?? segmentId
  );
  const stijlLabels = (kunstwerk.stijlIds ?? []).map(
    (stijlId) => (stijlen ?? []).find((stijl) => stijl.id === stijlId)?.omschrijving ?? stijlId
  );
  const onderwerpLabels = (kunstwerk.onderwerpIds ?? []).map(
    (onderwerpId) => (onderwerpen ?? []).find((onderwerp) => onderwerp.id === onderwerpId)?.omschrijving ?? onderwerpId
  );
  const heeftMetaInfo =
    Boolean(artiestNaam) || collectieLabels.length > 0 || stijlLabels.length > 0 || onderwerpLabels.length > 0;

  const customBreedteNum = Number(customBreedte);
  const customHoogteNum = Number(customHoogte);
  const customSizeFilledIn =
    customBreedte !== '' && customHoogte !== '' && customBreedteNum > 0 && customHoogteNum > 0;
  const customSizeExceedsMax = customSizeFilledIn && !withinMax(customBreedteNum, customHoogteNum, geselecteerdSoort);
  const customSizeValid = customSizeFilledIn && !customSizeExceedsMax;
  const materiaalloosPrijs =
    isMateriaalloos && customSizeValid && kunstwerk.prijsPerM2
      ? Math.round((customBreedteNum / 100) * (customHoogteNum / 100) * kunstwerk.prijsPerM2 * 100) / 100
      : null;

  const quantityNum = Number(quantityInput);
  const quantityValid =
    quantityInput.trim() !== '' && Number.isInteger(quantityNum) && quantityNum >= effectiveMinimum;

  const canConfirm =
    (isMateriaalloos
      ? customSizeValid && Boolean(kunstwerk.prijsPerM2) && (kunstwerk.prijsPerM2 ?? 0) > 0
      : isCustomSize
        ? customSizeValid
        : Boolean(prijsRegel)) && quantityValid;

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
    if (isMateriaalloos) {
      addItem({
        kunstwerkId: kunstwerk.id,
        foto: kunstwerk.foto,
        omschrijving,
        materiaalId: '',
        materiaalLabel: MATERIAALLOOS_LABEL,
        maatId: '',
        maatLabel: `${customBreedteNum}×${customHoogteNum} cm${t('customSizeSuffix')}`,
        breedte: customBreedteNum,
        hoogte: customHoogteNum,
        prijs: materiaalloosPrijs,
        quantity: quantityNum,
      });
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user));
      setIsConfirmed(true);
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onClose();
      }, CONFIRM_FEEDBACK_MS);
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
        quantity: quantityNum,
      });
      void logActiviteit('mandje_eigen_maat_toegevoegd', actorFromCustomer(user), kunstwerk.naam);
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
        quantity: quantityNum,
      });
      void logActiviteit('mandje_toegevoegd', actorFromCustomer(user), kunstwerk.naam);
    }
    setIsConfirmed(true);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, CONFIRM_FEEDBACK_MS);
  }

  const closeButton =
    variant === 'dialog' ? (
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
    ) : null;

  const body = (
    <>
      <WatermarkedImage
        src={kunstwerk.foto}
        alt={omschrijving}
        fit="contain"
        fitBackground="ink"
        className={`h-56 w-full border-b border-gold/50 bg-ink ${
          variant === 'dialog' ? 'sm:h-full sm:border-b-0 sm:border-r' : ''
        }`}
      />
      <div className="flex flex-col gap-4 p-6">
        <p data-testid="product-modal-omschrijving" className="text-sm leading-relaxed text-white/80">
          {omschrijving}
        </p>
        {heeftMetaInfo && (
          <dl
            data-testid="product-modal-meta"
            className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-y border-gold/30 py-3 text-xs"
          >
            {artiestNaam && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('artistLabel')}</dt>
                <dd data-testid="product-modal-artiest" className="text-white/75">
                  {artiestNaam}
                </dd>
              </>
            )}
            {collectieLabels.length > 0 && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('collectionsLabel')}</dt>
                <dd data-testid="product-modal-collecties" className="text-white/75">
                  {collectieLabels.join(', ')}
                </dd>
              </>
            )}
            {stijlLabels.length > 0 && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('stijlLabel')}</dt>
                <dd data-testid="product-modal-stijl" className="text-white/75">
                  {stijlLabels.join(', ')}
                </dd>
              </>
            )}
            {onderwerpLabels.length > 0 && (
              <>
                <dt className="font-head text-[10px] uppercase tracking-wide text-gold/90">{t('onderwerpLabel')}</dt>
                <dd data-testid="product-modal-onderwerp" className="text-white/75">
                  {onderwerpLabels.join(', ')}
                </dd>
              </>
            )}
          </dl>
        )}
        {!isMateriaalloos && (
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
        )}
        {!isMateriaalloos && (
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
        )}
        {(isCustomSize || isMateriaalloos) && (
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
        {isMateriaalloos ? (
          materiaalloosPrijs !== null && (
            <p data-testid="product-modal-prijs" className="text-sm text-white/80">
              {formatCurrency(materiaalloosPrijs)}
            </p>
          )
        ) : isCustomSize ? (
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm text-white/80">
            <span className="text-[0.65rem] uppercase tracking-wide text-white/60">{t('quantity')}</span>
            <div className="flex h-10 items-center overflow-hidden rounded-full border border-white/20">
              <button
                type="button"
                data-testid="product-modal-quantity-minus"
                onClick={() =>
                  setQuantityInput((current) =>
                    String(Math.max(effectiveMinimum, (Number(current) || effectiveMinimum) - 1))
                  )
                }
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                −
              </button>
              <input
                type="number"
                data-testid="product-modal-quantity-value"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
                className="h-full w-14 bg-transparent text-center text-sm text-white"
              />
              <button
                type="button"
                data-testid="product-modal-quantity-plus"
                onClick={() => setQuantityInput((current) => String((Number(current) || effectiveMinimum) + 1))}
                className="flex h-full w-9 items-center justify-center text-white/80 transition hover:bg-gold hover:text-ink"
              >
                +
              </button>
            </div>
          </div>
          {!quantityValid && (
            <p data-testid="product-modal-quantity-error" className="text-right text-xs text-red-400">
              {t('minimumQuantityError', { minimum: effectiveMinimum })}
            </p>
          )}
        </div>
        {variant === 'dialog' && blockedReason && (
          <p data-testid="product-modal-order-blocked" className="text-xs text-amber-400">
            {blockedReason === 'exclusive'
              ? t('orderBlockedExclusive')
              : blockedReason === 'artistOnly'
              ? t('orderBlockedArtistOnly')
              : t('orderBlockedUnavailable')}
          </p>
        )}
        <button
          type="button"
          data-testid="product-modal-confirm"
          onClick={variant === 'preview' ? undefined : handleConfirm}
          disabled={variant === 'preview' || isConfirmed || !canConfirm || !canOrder}
          className={`rounded-sm px-4 py-2.5 text-xs tracking-[0.15em] transition disabled:opacity-40 ${
            isConfirmed ? 'cursor-default bg-green-500 text-white' : 'btn-gold'
          }`}
        >
          {variant === 'preview' ? t('previewOrderDisabled') : isConfirmed ? t('added') : t('confirm')}
        </button>
      </div>
    </>
  );

  // The preview variant is embedded in a fixed-width beheer sidebar (see
  // KunstwerkenSection's 320px column) rather than centered in the full
  // viewport, so the sm: breakpoint below doesn't reflect its actual
  // available width — it must always stay single-column.
  const panelClassName = `relative z-10 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-charcoal ${
    variant === 'dialog' ? 'sm:grid-cols-2' : ''
  }`;

  if (variant === 'preview') {
    return (
      <div data-testid="product-modal" className={panelClassName}>
        {body}
      </div>
    );
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
      <div className={panelClassName}>
        {closeButton}
        {body}
      </div>
    </div>
  );
}
