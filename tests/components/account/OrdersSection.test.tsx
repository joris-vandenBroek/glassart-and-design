import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { OrdersSection } from '@/components/account/OrdersSection';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

let authUser: Record<string, unknown> | null = null;
let ordersResponse: { ok: boolean; body?: unknown } = { ok: true, body: [] };

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <OrdersSection />
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

function signedInWithOneOrder() {
  authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
  ordersResponse = {
    ok: true,
    body: [
      {
        id: 'header-1',
        bestelnr: 'GD-00001',
        besteldatum: '2026-07-01T14:30:00',
        status: 'Te beoordelen',
        lines: [{ id: 'line-1', kunstwerkId: null, maatId: null, materiaalId: null, prijs: null, quantity: 2 }],
      },
    ],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  authUser = null;
  ordersResponse = { ok: true, body: [] };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    if (url.startsWith('/api/bestelheaders')) {
      return { ok: ordersResponse.ok, json: async () => ordersResponse.body };
    }
    return { ok: true, json: async () => [] };
  });
});

describe('OrdersSection', () => {
  it('shows nothing when there are no orders', () => {
    renderSection();
    expect(screen.queryByTestId(/^account-order-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('orders-load-error')).not.toBeInTheDocument();
  });

  it('shows an error message when loading orders fails', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    ordersResponse = { ok: false };

    renderSection();

    expect(await screen.findByTestId('orders-load-error')).toHaveTextContent(
      'Bestellingen konden niet worden geladen. Probeer het later opnieuw.'
    );
  });

  it('renders a real order with bestelnr, description, date and time, and no status', async () => {
    signedInWithOneOrder();
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());
    expect(screen.getByText('1 bestelregel, totaal 2 stuks')).toBeInTheDocument();
    expect(screen.getByText('1-7-2026 14:30')).toBeInTheDocument();
    expect(screen.queryByText('Te beoordelen')).not.toBeInTheDocument();
  });

  it('opens a modal with order details when a row is clicked', async () => {
    signedInWithOneOrder();
    renderSection();
    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());
    expect(screen.queryByTestId('account-order-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('account-order-GD-00001'));

    expect(screen.getByTestId('account-order-modal')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-modal-line-line-1')).toBeInTheDocument();
    expect(screen.getByText('Onbekend artikel')).toBeInTheDocument();
  });
});
