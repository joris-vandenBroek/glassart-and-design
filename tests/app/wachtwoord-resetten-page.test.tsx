import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/nl.json';

let currentSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => currentSearchParams,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('WachtwoordResettenPage', () => {
  it('always renders the reset form, regardless of MIJNHOST_BUILD (unlike the launch-scoped pages)', async () => {
    const originalEnv = process.env.MIJNHOST_BUILD;
    process.env.MIJNHOST_BUILD = 'true';
    try {
      currentSearchParams = new URLSearchParams('token=token-123');
      const { default: WachtwoordResettenPage } = await import('@/app/[locale]/wachtwoord-resetten/page');
      const ui = await WachtwoordResettenPage({ params: { locale: 'nl' } });
      render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

      expect(screen.getByText('Wachtwoord opnieuw instellen')).toBeInTheDocument();
      expect(screen.getByTestId('reset-password-submit')).toBeInTheDocument();
      expect(screen.queryByTestId('under-construction')).not.toBeInTheDocument();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.MIJNHOST_BUILD;
      } else {
        process.env.MIJNHOST_BUILD = originalEnv;
      }
    }
  });
});
