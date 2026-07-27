import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
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

describe('ContactPage', () => {
  const originalEnv = process.env.MIJNHOST_BUILD;

  beforeEach(() => {
    process.env.MIJNHOST_BUILD = 'true';
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MIJNHOST_BUILD;
    } else {
      process.env.MIJNHOST_BUILD = originalEnv;
    }
  });

  it('shows the under-construction page on the mijn.host build (pageAvailability.contact is false)', async () => {
    const { default: ContactPage } = await import('@/app/[locale]/contact/page');
    const page = (await ContactPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
  });
});
