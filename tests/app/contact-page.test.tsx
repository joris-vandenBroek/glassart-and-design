import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ContactPage from '@/app/[locale]/contact/page';
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
  it('shows the under-construction page while pageAvailability.contact is false', async () => {
    const page = (await ContactPage({ params: { locale: 'nl' } })) as any;
    const ui = await page.type(page.props);
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
  });
});
