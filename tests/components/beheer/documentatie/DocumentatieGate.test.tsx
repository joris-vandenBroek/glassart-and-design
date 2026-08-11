import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DocumentatieGate } from '@/components/beheer/documentatie/DocumentatieGate';
import messages from '../../../../messages/nl.json';

const logoutMock = vi.fn();
let mockAuthState: {
  user: { uid: string; email: string | null } | null;
  isAdmin: boolean;
  isHydrated: boolean;
};

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ ...mockAuthState, logout: logoutMock }),
}));

function renderGate() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DocumentatieGate />
    </NextIntlClientProvider>
  );
}

describe('DocumentatieGate', () => {
  it('renders nothing while not hydrated', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: false };
    renderGate();
    expect(screen.queryByTestId('documentatie-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('documentatie-unauthorized')).not.toBeInTheDocument();
  });

  it('shows an unauthorized message when not logged in', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: true };
    renderGate();
    expect(screen.getByTestId('documentatie-unauthorized')).toBeInTheDocument();
  });

  it('signs out and shows unauthorized when logged in without staff rights', async () => {
    mockAuthState = { user: { uid: 'uid-2', email: 'onbekend@glassartanddesign.com' }, isAdmin: false, isHydrated: true };
    renderGate();
    expect(screen.getByTestId('documentatie-unauthorized')).toBeInTheDocument();
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });

  it('shows the documentation with the sidebar and chapter 1 when authorized', () => {
    mockAuthState = { user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' }, isAdmin: true, isHydrated: true };
    renderGate();
    expect(screen.getByTestId('documentatie-page')).toBeInTheDocument();
    expect(screen.getByTestId('documentatie-sidebar')).toBeInTheDocument();
    expect(document.getElementById('klant-website')).not.toBeNull();
    expect(document.getElementById('klant-registratie-goedkeuren')).not.toBeNull();
    expect(document.getElementById('bestelproces-drukker')).not.toBeNull();
    expect(document.getElementById('kunstwerken-code')).not.toBeNull();
    expect(document.getElementById('kunstenaars-exclusiviteit')).not.toBeNull();
    expect(document.getElementById('prijsmatrix')).not.toBeNull();
    expect(document.getElementById('stamgegevens-prijsgroepen')).not.toBeNull();
    expect(document.getElementById('drukkers-standaard')).not.toBeNull();
    expect(document.getElementById('glassart-design')).not.toBeNull();
    expect(document.getElementById('instellingen')).not.toBeNull();
  });
});
