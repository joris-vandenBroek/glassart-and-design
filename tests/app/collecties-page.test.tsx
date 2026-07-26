import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import CollectiesPage from '@/app/[locale]/collecties/page';
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

// Mock UnderConstruction as a testable sync component. This mock is technically necessary
// because UnderConstruction is an async server component, and jsdom/vitest environments
// cannot render async RSCs directly (they return Promise objects that React rejects).
// The mock preserves test integrity by:
// 1. Using the real pageAvailability config (not mocked)
// 2. Testing real CollectiesPage logic
// 3. Verifying the guard clause works without being blocked by async component limitations
vi.mock('@/components/UnderConstruction', () => ({
  UnderConstruction: () => <div data-testid="under-construction">Under Construction</div>,
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
  it('shows the under-construction page while pageAvailability.collecties is false', async () => {
    const ui = await CollectiesPage({ params: { locale: 'nl' } });
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
    expect(screen.queryByText('Ontdek onze kunstwerken op glas, gerangschikt per toepassing.')).not.toBeInTheDocument();
  });
});
