import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { UnderConstruction } from '@/components/UnderConstruction';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// `getTranslations` from `next-intl/server` requires the `react-server` module
// resolution condition, which Vitest's default (client) environment does not set.
// Mock it to read the same nl.json messages, so the component under test keeps
// its real `getTranslations`-based implementation (matching how the real
// page.tsx server components consume it) while still being unit-testable.
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const namespaceMessages = (messages as unknown as Record<string, Record<string, string>>)[
      namespace
    ];
    return (key: string) => namespaceMessages[key];
  },
}));

describe('UnderConstruction', () => {
  it('shows the under-construction message and a link back home', async () => {
    // `UnderConstruction` is an async server component. React's client renderer
    // (used by @testing-library/react under Vitest/jsdom) cannot resolve a
    // Promise returned directly as a child ("Objects are not valid as a React
    // child"), so we await the component call ourselves to get its resolved
    // element tree, then render that — the standard pattern for unit-testing
    // async Server Components outside of Next.js's RSC renderer.
    const ui = await UnderConstruction();
    render(<NextIntlClientProvider locale="nl" messages={messages}>{ui}</NextIntlClientProvider>);

    expect(await screen.findByTestId('under-construction')).toBeInTheDocument();
    expect(screen.getByText('Binnenkort')).toBeInTheDocument();
    expect(screen.getByText('We zijn met iets moois bezig')).toBeInTheDocument();
    expect(
      screen.getByText('Deze pagina is in ontwikkeling. Kom binnenkort terug om het resultaat te zien.')
    ).toBeInTheDocument();

    const backHomeLink = screen.getByText('Terug naar home');
    expect(backHomeLink).toBeInTheDocument();
    expect(backHomeLink.closest('a')).toHaveAttribute('href', '/');
  });
});
