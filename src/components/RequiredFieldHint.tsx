import type { ReactNode } from 'react';

export function RequiredMark() {
  return (
    <span className="text-red-400" aria-hidden="true">
      {' *'}
    </span>
  );
}

interface RequiredLegendProps {
  testId: string;
  children: ReactNode;
}

export function RequiredLegend({ testId, children }: RequiredLegendProps) {
  return (
    <p data-testid={testId} className="text-[11px] text-white/40">
      {children}
    </p>
  );
}
