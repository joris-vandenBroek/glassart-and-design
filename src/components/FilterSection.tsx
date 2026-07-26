'use client';

import { useState, type ReactNode } from 'react';

interface FilterSectionProps {
  title: string;
  testId: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FilterSection({ title, testId, defaultOpen = true, children }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-testid={`filter-section-${testId}`} className="border-b border-white/10 py-4 first:pt-0 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        data-testid={`filter-section-${testId}-toggle`}
        className="flex w-full items-center justify-between text-left text-xs font-head uppercase tracking-[0.14em] text-white/80"
      >
        {title}
        <span
          aria-hidden="true"
          className={`text-[10px] text-white/40 transition-transform ${open ? '' : '-rotate-90'}`}
        >
          &#9662;
        </span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
