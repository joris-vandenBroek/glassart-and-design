'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface HelpHintProps {
  text: string;
  size?: 'sm' | 'md';
  testId?: string;
}

type Placement = 'center' | 'left' | 'right';

const VIEWPORT_MARGIN = 16;

const PLACEMENT_CLASS: Record<Placement, string> = {
  center: 'left-1/2 -translate-x-1/2',
  left: 'left-0',
  right: 'right-0',
};

export function HelpHint({ text, size = 'md', testId }: HelpHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>('center');
  const containerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const buttonTestId = testId ?? 'help-hint-button';
  const popoverTestId = testId ? `${testId}-popover` : 'help-hint-popover';

  // Runs before paint, so a corrected placement never flashes the default centered one.
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current || !popoverRef.current) {
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const popoverWidth = popoverRef.current.getBoundingClientRect().width;
    const centeredLeft = containerRect.left + containerRect.width / 2 - popoverWidth / 2;
    const centeredRight = centeredLeft + popoverWidth;
    if (centeredLeft < VIEWPORT_MARGIN) {
      setPlacement('left');
    } else if (centeredRight > window.innerWidth - VIEWPORT_MARGIN) {
      setPlacement('right');
    } else {
      setPlacement('center');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    const container = containerRef.current;
    container?.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      container?.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const dimensionClass = size === 'sm' ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-xs';

  return (
    <span ref={containerRef} className="relative inline-flex normal-case tracking-normal">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Uitleg"
        title="Uitleg"
        data-testid={buttonTestId}
        className={`inline-flex ${dimensionClass} shrink-0 items-center justify-center rounded-full border border-gold font-semibold text-gold hover:border-gold-bright hover:text-gold-bright`}
      >
        ?
      </button>
      {isOpen && (
        <span
          ref={popoverRef}
          role="tooltip"
          data-testid={popoverTestId}
          className={`absolute top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] whitespace-pre-line rounded-md border border-white/10 bg-charcoal p-3 text-xs font-normal leading-relaxed text-white/80 shadow-lg ${PLACEMENT_CLASS[placement]}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
