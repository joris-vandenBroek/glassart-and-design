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
let kunstwerkenResponse: unknown[] = [];
let klantMeResponse: unknown = { land: 'NL', invoiceLand: '' };
let btwTarievenResponse: unknown = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };

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
  kunstwerkenResponse = [];
  klantMeResponse = { land: 'NL', invoiceLand: '' };
  btwTarievenResponse = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    if (url === '/api/klanten/me') {
      return { ok: true, json: async () => klantMeResponse };
    }
    if (url === '/api/instellingen/btwtarieven') {
      return { ok: true, json: async () => btwTarievenResponse };
    }
    if (url.startsWith('/api/bestelheaders')) {
      return { ok: ordersResponse.ok, json: async () => ordersResponse.body };
    }
    if (url === '/api/kunstwerken') {
      return { ok: true, json: async () => kunstwerkenResponse };
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

  it('renders a real order with bestelnr, description, date, time and a status badge', async () => {
    signedInWithOneOrder();
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());
    expect(screen.getByText('1 bestelregel, totaal 2 stuks')).toBeInTheDocument();
    expect(screen.getByText('1-7-2026 14:30')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-00001-status')).toHaveTextContent('In behandeling');
  });

  it('shows "Afgewezen" for a rejected order', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00002',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Afgewezen',
          lines: [{ id: 'line-1', kunstwerkId: null, maatId: null, materiaalId: null, prijs: null, quantity: 1 }],
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00002')).toBeInTheDocument());
    expect(screen.getByTestId('account-order-GD-00002-status')).toHaveTextContent('Afgewezen');
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

  it('shows a single unknown-item placeholder thumbnail when no line has a resolvable kunstwerkId', async () => {
    signedInWithOneOrder();
    renderSection();
    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());

    const stack = screen.getByTestId('account-order-GD-00001-thumbnails');
    expect(stack.children).toHaveLength(1);
    expect(stack).toHaveTextContent('?');
  });

  it('shows a real thumbnail image for a line with a resolvable kunstwerkId', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    kunstwerkenResponse = [
      {
        id: 'kw-1',
        foto: 'https://example.com/kw-1.jpg',
        naam: 'Hotel paneel',
        kunstenaarId: null,
        segmentIds: [],
        materiaalIds: [],
        maatIds: [],
        omschrijvingNl: 'Hotel paneel',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      },
    ];
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00003',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: null, materiaalId: null, prijs: null, quantity: 1 }],
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00003')).toBeInTheDocument());
    const stack = screen.getByTestId('account-order-GD-00003-thumbnails');
    expect(stack.children).toHaveLength(1);
    expect(stack.querySelector('img')).toHaveAttribute('src', 'https://example.com/kw-1.jpg');
  });

  it('caps the thumbnail stack at 3 and shows a "+N" badge for more than 3 unique kunstwerken', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    kunstwerkenResponse = ['kw-1', 'kw-2', 'kw-3', 'kw-4'].map((id) => ({
      id,
      foto: `https://example.com/${id}.jpg`,
      naam: id,
      kunstenaarId: null,
      segmentIds: [],
      materiaalIds: [],
      maatIds: [],
      omschrijvingNl: id,
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    }));
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00004',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: ['kw-1', 'kw-2', 'kw-3', 'kw-4'].map((id, index) => ({
            id: `line-${index}`,
            kunstwerkId: id,
            maatId: null,
            materiaalId: null,
            prijs: null,
            quantity: 1,
          })),
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00004')).toBeInTheDocument());
    const stack = screen.getByTestId('account-order-GD-00004-thumbnails');
    expect(stack.children).toHaveLength(3);
    expect(stack).toHaveTextContent('+2');
  });

  it('deduplicates lines with the same kunstwerkId and renders only 1 tile', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    kunstwerkenResponse = [
      {
        id: 'kw-1',
        foto: 'https://example.com/kw-1.jpg',
        naam: 'Hotel paneel',
        kunstenaarId: null,
        segmentIds: [],
        materiaalIds: [],
        maatIds: [],
        omschrijvingNl: 'Hotel paneel',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      },
    ];
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00005',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: [
            { id: 'line-1', kunstwerkId: 'kw-1', maatId: null, materiaalId: null, prijs: null, quantity: 1 },
            { id: 'line-2', kunstwerkId: 'kw-1', maatId: null, materiaalId: null, prijs: null, quantity: 2 },
          ],
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00005')).toBeInTheDocument());
    const stack = screen.getByTestId('account-order-GD-00005-thumbnails');
    expect(stack.children).toHaveLength(1);
  });

  it('renders 3 tiles for exactly 3 unique kunstwerken without an overflow badge', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd' };
    kunstwerkenResponse = ['kw-1', 'kw-2', 'kw-3'].map((id) => ({
      id,
      foto: `https://example.com/${id}.jpg`,
      naam: id,
      kunstenaarId: null,
      segmentIds: [],
      materiaalIds: [],
      maatIds: [],
      omschrijvingNl: id,
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    }));
    ordersResponse = {
      ok: true,
      body: [
        {
          id: 'header-1',
          bestelnr: 'GD-00006',
          besteldatum: '2026-07-01T14:30:00',
          status: 'Te beoordelen',
          lines: ['kw-1', 'kw-2', 'kw-3'].map((id, index) => ({
            id: `line-${index}`,
            kunstwerkId: id,
            maatId: null,
            materiaalId: null,
            prijs: null,
            quantity: 1,
          })),
        },
      ],
    };
    renderSection();

    await waitFor(() => expect(screen.getByTestId('account-order-GD-00006')).toBeInTheDocument());
    const stack = screen.getByTestId('account-order-GD-00006-thumbnails');
    expect(stack.children).toHaveLength(3);
    expect(stack).not.toHaveTextContent('+');
  });

  it('gives the id/description/status/date row both a mobile (2-row grid) and a desktop (1-row grid) layout', async () => {
    signedInWithOneOrder();
    renderSection();
    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());

    const row = screen.getByTestId('account-order-GD-00001-row');
    expect(row.className).toMatch(/grid-cols-\[minmax\(0,1fr\)_auto\]/);
    expect(row.className).toMatch(/sm:grid-cols-\[auto_minmax\(0,1fr\)_auto_auto\]/);
  });

  it('passes the klant\'s own land through to the order modal for btw calculation', async () => {
    klantMeResponse = { land: 'BE', invoiceLand: '' };
    signedInWithOneOrder();
    (ordersResponse.body as { lines: { prijs: number | null }[] }[])[0].lines[0].prijs = 100;
    renderSection();
    await waitFor(() => expect(screen.getByTestId('account-order-GD-00001')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('account-order-GD-00001'));
    expect(screen.getByTestId('account-order-modal-total')).toBeInTheDocument();
  });
});
