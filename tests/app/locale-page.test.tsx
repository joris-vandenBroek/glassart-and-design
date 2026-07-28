import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LocalePage from '@/app/[locale]/page';
import messages from '../../messages/nl.json';

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.startsWith('/api/instellingen/') ? null : []),
  }))
);

describe('LocalePage', () => {
  it('renders all five sections for the nl locale', async () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <LocalePage />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Kunst op glas')).toBeInTheDocument();
    expect(screen.getByText('Over ons')).toBeInTheDocument();
    expect(screen.getByText('Waarom Glassart & Design')).toBeInTheDocument();
    expect(await screen.findByText('Uitgelichte werken')).toBeInTheDocument();
  });
});
