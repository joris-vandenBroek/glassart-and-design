'use client';

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeLabel: string;
  closeButtonAriaLabel?: string;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  subtitle?: ReactNode;
  footerActions?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  closeLabel,
  closeButtonAriaLabel,
  title,
  children,
  wide = false,
  subtitle,
  footerActions,
}: ModalProps) {
  const t = useTranslations('modal');
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useOverlayDismiss({
    isOpen,
    onClose,
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      ref={modalRef}
      data-testid="modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        data-testid="modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-lg border border-white/10 bg-charcoal ${
          wide ? 'max-w-[1400px]' : 'max-w-lg'
        }`}
      >
        <button
          ref={closeButtonRef}
          type="button"
          data-testid="modal-close"
          aria-label={closeButtonAriaLabel ?? closeLabel}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
        >
          ×
        </button>
        <div data-testid="modal-header" className="shrink-0 border-b border-white/10 px-6 pb-3 pt-6 pr-10">
          <h2 className="text-base font-semibold tracking-wide text-white">{title}</h2>
          {subtitle && <div className="mt-0.5 text-xs text-white/50">{subtitle}</div>}
        </div>
        <div data-testid="modal-body" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
        <div
          data-testid="modal-footer"
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 pb-6 pt-4"
        >
          <div className="flex flex-wrap gap-2">{footerActions}</div>
          <button
            type="button"
            data-testid="modal-footer-close"
            onClick={onClose}
            title={t('closeTooltip')}
            className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
