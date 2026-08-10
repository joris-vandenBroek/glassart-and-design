import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CartPanel } from '@/components/CartPanel';
import { CartProvider, useCart } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
const logActiviteitMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type CollectionItem = { id: string } & Record<string, unknown>;

// kw-1/kw-2 are the kunstwerken the cart seeds below refer to; without a kunstenaar they
// are orderable by anyone, which is what the pre-existing tests assume.
const DEFAULT_COLLECTIONS: Record<string, CollectionItem[]> = {
  kunstwerken: [
    { id: 'kw-1', kunstenaarnr: null },
    { id: 'kw-2', kunstenaarnr: null },
  ],
  kunstenaars: [],
};

let collections: Record<string, CollectionItem[]> = DEFAULT_COLLECTIONS;
let collectionsShouldError = false;
let collectionsPending: string | null = null;

function mockCollections(overrides: Record<string, CollectionItem[]> = {}) {
  collections = { ...DEFAULT_COLLECTIONS, ...overrides };
}

const useApiCollectionMock = vi.fn((resource: string, options?: { skip?: boolean }) => {
  if (options?.skip) {
    return { items: null, error: null, add: vi.fn(), update: vi.fn(), remove: vi.fn(), refetch: vi.fn() };
  }
  if (collectionsPending === resource) {
    return { items: null, error: null, add: vi.fn(), update: vi.fn(), remove: vi.fn(), refetch: vi.fn() };
  }
  if (collectionsShouldError) {
    return { items: null, error: 'load', add: vi.fn(), update: vi.fn(), remove: vi.fn(), refetch: vi.fn() };
  }
  return {
    items: collections[resource] ?? [],
    error: null,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    refetch: vi.fn(),
  };
});

vi.mock('@/lib/useApiCollection', () => ({
  useApiCollection: (resource: string, options?: { skip?: boolean }) => useApiCollectionMock(resource, options),
}));

let authUser: Record<string, unknown> | null = {
  id: 'uid-1',
  email: 'klant@example.com',
  companyName: 'Testbedrijf BV',
  contactPerson: null,
  status: 'Goedgekeurd',
};
let orderResponse: { ok: boolean; body?: unknown } = {
  ok: true,
  body: { id: 'header-1', bestelnr: 'GD-00001' },
};
let mailResponse: { ok: boolean } = { ok: true };
let mailRejects = false;

fetchMock.mockImplementation(async (url: string) => {
  if (url === '/api/auth/me?type=klant') {
    return { ok: true, json: async () => ({ user: authUser }) };
  }
  if (url === '/api/bestelheaders') {
    return { ok: orderResponse.ok, json: async () => orderResponse.body };
  }
  if (mailRejects) {
    throw new Error('network error');
  }
  return mailResponse;
});

const SEED_ITEM = {
  kunstwerkId: 'kw-1',
  foto: 'https://example.com/kw-1.jpg',
  omschrijving: 'Wellness paneel',
  materiaalId: 'mat-1',
  materiaalLabel: '4mm — Veiligheidsglas',
  maatId: 'maat-1',
  maatLabel: '60×90 cm',
  prijs: 150,
  quantity: 2,
};

function Seed() {
  const { addItem } = useCart();
  return (
    <button type="button" data-testid="seed-cart" onClick={() => addItem(SEED_ITEM)}>
      Seed
    </button>
  );
}

// Het mandje hoort bij een klant, dus het wordt pas geladen als /api/auth/me terug is.
// Seeden vóór dat moment landt in het mandje van niemand -- vandaar dit baken om op te
// wachten voordat een test items toevoegt.
function CartReady() {
  const { isHydrated } = useCart();
  return isHydrated ? <span data-testid="cart-ready" /> : null;
}

async function renderCartPanel() {
  const rendered = render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <CartReady />
          <Seed />
          <CartPanel />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
  await screen.findByTestId('cart-ready');
  return rendered;
}

function signedOut() {
  authUser = null;
}

function signedInAsApprovedCustomer() {
  authUser = {
    id: 'uid-1',
    email: 'klant@example.com',
    companyName: 'Testbedrijf BV',
    contactPerson: null,
    status: 'Goedgekeurd',
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mockCollections();
  collectionsShouldError = false;
  collectionsPending = null;
  orderResponse = { ok: true, body: { id: 'header-1', bestelnr: 'GD-00001' } };
  mailResponse = { ok: true };
  mailRejects = false;
  fetchMock.mockClear();
  useApiCollectionMock.mockClear();
  logActiviteitMock.mockReset();
  signedInAsApprovedCustomer();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CartPanel', () => {
  it('shows no badge when the cart is empty, and an empty message when opened', async () => {
    await renderCartPanel();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('shows a badge with the total quantity and lists cart items with materiaal/maat/price once seeded', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.queryByTestId('cart-empty')).not.toBeInTheDocument();
    expect(screen.getByText('Wellness paneel')).toBeInTheDocument();
    expect(screen.getByText('4mm — Veiligheidsglas · 60×90 cm · ×2')).toBeInTheDocument();
  });

  it('shows the total price of all cart items', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-total')).toHaveTextContent('€ 300,00');
  });

  it('shows the photo for each cart item', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('product-image')).toBeInTheDocument();
  });

  it('removes an item when its remove button is clicked', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    const removeButtons = screen.getAllByLabelText('Verwijderen');
    fireEvent.click(removeButtons[0]);
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
  });

  it('shows a login link instead of the place-order button when not logged in', async () => {
    signedOut();
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-login-to-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-login-to-order')).toHaveAttribute('href', '/inloggen');
    expect(screen.queryByTestId('cart-place-order')).not.toBeInTheDocument();
  });

  it('creates a bestelheader via /api/bestelheaders with the real kunstwerk/materiaal/maat/prijs per cart item, clears the cart and shows a confirmation message', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-confirmation')).toHaveTextContent(
      'Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.'
    );
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-place-order')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-clear')).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bestelheaders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          klantId: 'uid-1',
          lines: [{ kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
        }),
      })
    );
  });

  it('refuses to create the bestelheader when a cart item is no longer orderable by this klant', async () => {
    // The item was added while the kunstwerk was still free; only afterwards was it linked
    // to a kunstenaar who may only sell their own work.
    mockCollections({
      kunstwerken: [{ id: 'kw-1', kunstenaarnr: 'ka-1' }],
      kunstenaars: [
        { id: 'ka-1', kunstenaarnr: 'ka-1', naam: 'Solo Artiest', exclusieveKlantIds: ['andere-uid'] },
      ],
    });
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    // De knop komt pas vrij als kunstwerken én kunstenaars geladen zijn, dus dit
    // synchroniseert op de laadstatus in plaats van op toevallige timing.
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-place-order-error')).toHaveTextContent(
      'Kan de bestelling niet plaatsen: "Wellness paneel" is niet (meer) beschikbaar voor jou. Verwijder dit artikel uit je mandje en probeer opnieuw.'
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/bestelheaders', expect.anything());
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
  });

  it('places the order normally when the cart item is linked to an open kunstenaar', async () => {
    mockCollections({
      kunstwerken: [{ id: 'kw-1', kunstenaarnr: 'ka-1' }],
      kunstenaars: [{ id: 'ka-1', kunstenaarnr: 'ka-1', naam: 'Open Artiest', exclusieveKlantIds: [] }],
    });
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-confirmation')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/bestelheaders', expect.anything());
  });

  it('does not fetch the kunstwerken/kunstenaars collections for a visitor who is not a customer', async () => {
    signedOut();
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-login-to-order')).toBeInTheDocument());
    expect(useApiCollectionMock).toHaveBeenCalledWith('kunstwerken', { skip: true });
    expect(useApiCollectionMock).toHaveBeenCalledWith('kunstenaars', { skip: true });
  });

  it('keeps the place-order button disabled until the pre-check collections have loaded', async () => {
    collectionsPending = 'kunstwerken';
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).toBeInTheDocument());
    // Zonder deze poort zou een snelle klik hier "niet meer beschikbaar" opleveren voor
    // artikelen die gewoon in orde zijn.
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
  });

  it('keeps the place-order button disabled when loading the pre-check collections fails', async () => {
    collectionsShouldError = true;
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
    expect(screen.queryByTestId('cart-place-order-error')).not.toBeInTheDocument();
  });

  // De ontvanger en het relay-secret zitten bewust niet meer in deze request:
  // /api/mail stuurt een bestelbevestiging altijd naar het adres van de
  // ingelogde klant zelf. Het niet-geconfigureerd-geval is daarmee ook een
  // servergeval geworden -- zie tests/app/api/mail.test.ts.
  it('sends a confirmation email via /api/mail when the order succeeds', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soort: 'bestelbevestiging',
          subject: 'Bevestiging van uw bestelling — Glassart & Design',
          body: 'Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.',
        }),
      })
    );
  });

  it('still shows the order confirmation, plus a soft warning, if sending the email fails', async () => {
    mailRejects = true;
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-confirmation')).toBeInTheDocument();
    expect(await screen.findByTestId('cart-order-email-error')).toHaveTextContent(
      "Uw bestelling is geplaatst, maar de bevestigingsmail kon niet worden verzonden."
    );
  });

  it('shows the email warning when the mail endpoint responds with a non-ok status', async () => {
    mailResponse = { ok: false };
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-email-error')).toBeInTheDocument();
  });

  it('clears the confirmation message once the panel is closed and reopened', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));
    expect(await screen.findByTestId('cart-order-confirmation')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cart-close'));
    fireEvent.click(screen.getByTestId('cart-icon'));

    expect(screen.queryByTestId('cart-order-confirmation')).not.toBeInTheDocument();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('shows an error and keeps the cart intact when the order request fails', async () => {
    orderResponse = { ok: false };
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-place-order-error')).toHaveTextContent(
      'Er ging iets mis bij het plaatsen van de bestelling. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
  });

  it('disables the place-order button when the cart is empty', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
  });

  it('closes the panel when Escape is pressed', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('closes the panel when the backdrop is clicked', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-backdrop'));
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('empties the cart via "Bestelling leegmaken" without writing an order, and keeps the panel open', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-clear'));

    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/bestelheaders', expect.anything());
  });

  it('disables "Bestelling leegmaken" when the cart is empty', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-clear')).toBeDisabled();
  });

  it('logs bestelling_geplaatst with the logged-in klant when the order succeeds', async () => {
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_geplaatst',
      'GD-00001'
    );
  });

  it('does not log bestelling_geplaatst when the order request fails', async () => {
    orderResponse = { ok: false };
    await renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-place-order-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the unpriced-items note and excludes a custom-size item from the total', async () => {
    function SeedCustom() {
      const { addItem } = useCart();
      return (
        <button
          type="button"
          data-testid="seed-custom-cart"
          onClick={() =>
            addItem({
              kunstwerkId: 'kw-2',
              foto: 'https://example.com/kw-2.jpg',
              omschrijving: 'Eigen maat paneel',
              materiaalId: 'mat-2',
              materiaalLabel: '3mm — Acryl',
              maatId: '',
              maatLabel: '90×140 cm (eigen maat)',
              breedte: 90,
              hoogte: 140,
              prijs: null,
              quantity: 1,
            })
          }
        >
          Seed custom
        </button>
      );
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <CartReady />

            <SeedCustom />
            <CartPanel />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    await screen.findByTestId('cart-ready');
    fireEvent.click(screen.getByTestId('seed-custom-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));

    expect(screen.getByTestId('cart-total')).toHaveTextContent('€ 0,00');
    expect(screen.getByTestId('cart-unpriced-note')).toHaveTextContent('+ 1 artikel, prijs volgt na offerte');
    expect(screen.getByText('Prijs op aanvraag')).toBeInTheDocument();
  });

  it('sends breedte/hoogte and a null prijs to /api/bestelheaders for a custom-size cart item', async () => {
    function SeedCustom() {
      const { addItem } = useCart();
      return (
        <button
          type="button"
          data-testid="seed-custom-cart"
          onClick={() =>
            addItem({
              kunstwerkId: 'kw-2',
              foto: 'https://example.com/kw-2.jpg',
              omschrijving: 'Eigen maat paneel',
              materiaalId: 'mat-2',
              materiaalLabel: '3mm — Acryl',
              maatId: '',
              maatLabel: '90×140 cm (eigen maat)',
              breedte: 90,
              hoogte: 140,
              prijs: null,
              quantity: 1,
            })
          }
        >
          Seed custom
        </button>
      );
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <CartReady />

            <SeedCustom />
            <CartPanel />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    await screen.findByTestId('cart-ready');
    fireEvent.click(screen.getByTestId('seed-custom-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bestelheaders',
      expect.objectContaining({
        body: JSON.stringify({
          klantId: 'uid-1',
          lines: [{ kunstwerkId: 'kw-2', maatId: '', materiaalId: 'mat-2', prijs: null, quantity: 1, breedte: 90, hoogte: 140 }],
        }),
      })
    );
  });
});
