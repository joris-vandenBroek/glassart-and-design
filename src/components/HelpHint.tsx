'use client';

import { useEffect, useRef, useState } from 'react';

interface HelpHintProps {
  text: string;
  size?: 'sm' | 'md';
  testId?: string;
}

export function HelpHint({ text, size = 'md', testId }: HelpHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const buttonTestId = testId ?? 'help-hint-button';
  const popoverTestId = testId ? `${testId}-popover` : 'help-hint-popover';

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
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
        data-testid={buttonTestId}
        className={`inline-flex ${dimensionClass} shrink-0 items-center justify-center rounded-full border border-white/30 font-semibold text-white/60 hover:border-white/60 hover:text-white`}
      >
        ?
      </button>
      {isOpen && (
        <span
          role="tooltip"
          data-testid={popoverTestId}
          className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-md border border-white/10 bg-charcoal p-3 text-xs font-normal leading-relaxed text-white/80 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
