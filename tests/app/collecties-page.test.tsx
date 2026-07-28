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

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
  setRequestLocale: () => {},
}));

describe('CollectiesPage', () => {
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

  it('shows the under-construction page on the mijn.host build (pageAvailability.collecties is false)', async () => {
    const { default: CollectiesPage } = await import('@/app/[locale]/collecties/page');
    const page = (await CollectiesPage({ params: { locale: 'nl' } })) as any;
    // The guard returns an unresolved `<UnderConstruction />` element — it's itself an
    // async server component, so it must be awaited a second time before render().
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
    expect(screen.queryByText('Ontdek onze kunstwerken op glas, gerangschikt per toepassing.')).not.toBeInTheDocument();
  });
});
