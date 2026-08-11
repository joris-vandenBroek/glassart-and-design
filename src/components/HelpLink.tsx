'use client';

const DOCUMENTATIE_PAD = '/nl/beheer/documentatie';

interface HelpLinkProps {
  anchor?: string;
  label: string;
  size?: 'sm' | 'md';
  testId?: string;
  className?: string;
}

export function HelpLink({ anchor, label, size = 'md', testId, className = '' }: HelpLinkProps) {
  const href = anchor ? `${DOCUMENTATIE_PAD}#${anchor}` : DOCUMENTATIE_PAD;
  const sizeClasses = size === 'sm' ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-xs';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      data-testid={testId ?? 'help-link'}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-gold font-semibold leading-none text-gold transition hover:border-gold-bright hover:text-gold-bright ${sizeClasses} ${className}`}
    >
      ?
    </a>
  );
}
