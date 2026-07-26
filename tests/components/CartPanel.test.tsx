import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CartPanel } from '@/components/CartPanel';
import { CartProvider, useCart } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();
const getDocsMock = vi.fn();
const addDocMock = vi.fn();
const fetchMock = vi.fn();
const logActiviteitMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

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

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

const runTransactionMock = vi.fn(async (...args: unknown[]) => {
  const updateFn = args[1] as (transaction: unknown) => unknown;
  return updateFn({
    get: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
    set: vi.fn(),
  });
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  collection: vi.fn((_db, ...path) => ({ path })),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
}));

type SeededDoc = { id: string; data: Record<string, unknown> };

// kw-1/kw-2 are the kunstwerken the cart seeds below refer to; without a kunstenaar they
// are orderable by anyone, which is what the pre-existing tests assume.
const DEFAULT_COLLECTIONS: Record<string, SeededDoc[]> = {
  kunstwerken: [
    { id: 'kw-1', data: { kunstenaarId: null } },
    { id: 'kw-2', data: { kunstenaarId: null } },
  ],
  kunstenaars: [],
};

let collections: Record<string, SeededDoc[]> = DEFAULT_COLLECTIONS;

function mockCollections(overrides: Record<string, SeededDoc[]> = {}) {
  collections = { ...DEFAULT_COLLECTIONS, ...overrides };
}

function makeSnapshot(docsData: SeededDoc[]) {
  return {
    empty: docsData.length === 0,
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

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

function renderCartPanel() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <Seed />
          <CartPanel />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

function signedOut() {
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
}

function signedInAsApprovedCustomer() {
  getDocMock.mockResolvedValue({
    exists: () => true,
    data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV' }),
  });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com', companyName: 'Testbedrijf BV', contactPerson: null });
    return () => {};
  });
}

beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  getDocsMock.mockReset();
  mockCollections();
  getDocsMock.mockImplementation(async (ref: { path: string[] }) =>
    makeSnapshot(collections[ref.path[0]] ?? [])
  );
  addDocMock.mockReset();
  fetchMock.mockReset();
  logActiviteitMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  signedInAsApprovedCustomer();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CartPanel', () => {
  it('shows no badge when the cart is empty, and an empty message when opened', () => {
    renderCartPanel();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('shows a badge with the total quantity and lists cart items with materiaal/maat/price once seeded', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.queryByTestId('cart-empty')).not.toBeInTheDocument();
    expect(screen.getByText('Wellness paneel')).toBeInTheDocument();
    expect(screen.getByText('4mm — Veiligheidsglas · 60×90 cm · ×2')).toBeInTheDocument();
  });

  it('shows the total price of all cart items', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-total')).toHaveTextContent('€ 300,00');
  });

  it('shows a watermark overlay on each cart item photo', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('watermark-overlay')).toBeInTheDocument();
  });

  it('removes an item when its remove button is clicked', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    const removeButtons = screen.getAllByLabelText('Verwijderen');
    fireEvent.click(removeButtons[0]);
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
  });

  it('shows a login link instead of the place-order button when not logged in', async () => {
    signedOut();
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-login-to-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-login-to-order')).toHaveAttribute('href', '/inloggen');
    expect(screen.queryByTestId('cart-place-order')).not.toBeInTheDocument();
  });

  it('writes a bestelheader + one bestelline with the real kunstwerk/materiaal/maat/prijs per cart item, clears the cart and shows a confirmation message', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
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

    expect(addDocMock).toHaveBeenNthCalledWith(
      1,
      { path: ['bestelheaders'] },
      {
        klantId: 'uid-1',
        bestelnr: 'GD-00001',
        besteldatum: 'SERVER_TIMESTAMP',
        status: 'Te beoordelen',
      }
    );
    expect(addDocMock).toHaveBeenNthCalledWith(
      2,
      { path: ['bestelheaders', 'header-1', 'bestellines'] },
      { kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }
    );
  });

  it('refuses to create the bestelheader when a cart item is no longer orderable by this klant', async () => {
    // The item was added while the kunstwerk was still free; only afterwards was it linked
    // to a kunstenaar who may only sell their own work.
    mockCollections({
      kunstwerken: [{ id: 'kw-1', data: { kunstenaarId: 'ka-1' } }],
      kunstenaars: [
        {
          id: 'ka-1',
          data: { naam: 'Solo Artiest', verkooprecht: 'alleen-kunstenaar', klantId: 'andere-uid', exclusiefVoorKlantId: null },
        },
      ],
    });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    // De knop komt pas vrij als kunstwerken én kunstenaars geladen zijn, dus dit
    // synchroniseert op de laadstatus in plaats van op toevallige timing.
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    expect(getDocsMock).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-place-order-error')).toHaveTextContent(
      'Kan de bestelling niet plaatsen: "Wellness paneel" is niet (meer) beschikbaar voor jou. Verwijder dit artikel uit je mandje en probeer opnieuw.'
    );
    expect(addDocMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
  });

  it('places the order normally when the cart item is linked to an open kunstenaar', async () => {
    mockCollections({
      kunstwerken: [{ id: 'kw-1', data: { kunstenaarId: 'ka-1' } }],
      kunstenaars: [
        { id: 'ka-1', data: { naam: 'Open Artiest', verkooprecht: 'open', klantId: null, exclusiefVoorKlantId: null } },
      ],
    });
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    expect(getDocsMock).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-confirmation')).toBeInTheDocument();
    expect(addDocMock).toHaveBeenNthCalledWith(1, { path: ['bestelheaders'] }, expect.anything());
  });

  it('does not read the kunstwerken/kunstenaars collections for a visitor who is not a customer', async () => {
    signedOut();
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-login-to-order')).toBeInTheDocument());
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it('keeps the place-order button disabled until the pre-check collections have loaded', async () => {
    let resolveKunstwerken: (snapshot: ReturnType<typeof makeSnapshot>) => void = () => {};
    getDocsMock.mockImplementation((ref: { path: string[] }) => {
      if (ref.path[0] === 'kunstwerken') {
        return new Promise((resolve) => {
          resolveKunstwerken = resolve;
        });
      }
      return Promise.resolve(makeSnapshot(collections[ref.path[0]] ?? []));
    });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).toBeInTheDocument());
    // Zonder deze poort zou een snelle klik hier "niet meer beschikbaar" opleveren voor
    // artikelen die gewoon in orde zijn.
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();

    resolveKunstwerken(makeSnapshot(collections.kunstwerken));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
  });

  it('keeps the place-order button disabled when loading the pre-check collections fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
    expect(screen.queryByTestId('cart-place-order-error')).not.toBeInTheDocument();
  });

  it('sends a confirmation email via fetch when the order succeeds and mail env vars are set', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/mail.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'test-secret',
          to: 'klant@example.com',
          subject: 'Bevestiging van uw bestelling — Glassart & Design',
          body: 'Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.',
        }),
      })
    );
  });

  it('does not call fetch when the mail endpoint/secret env vars are not set', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still shows the order confirmation, plus a soft warning, if sending the email fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
    fetchMock.mockRejectedValue(new Error('network error'));
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
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
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
    fetchMock.mockResolvedValue({ ok: false });
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-email-error')).toBeInTheDocument();
  });

  it('clears the confirmation message once the panel is closed and reopened', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
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

  it('shows an error and keeps the cart intact when the Firestore write fails', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'));
    renderCartPanel();
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
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
  });

  it('closes the panel when Escape is pressed', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('closes the panel when the backdrop is clicked', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-backdrop'));
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('empties the cart via "Bestelling leegmaken" without writing an order, and keeps the panel open', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-clear'));

    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('disables "Bestelling leegmaken" when the cart is empty', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-clear')).toBeDisabled();
  });

  it('logs bestelling_geplaatst with the logged-in klant when the order succeeds', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_geplaatst', {
      id: 'uid-1',
      email: 'klant@example.com',
      naam: 'Testbedrijf BV',
    });
  });

  it('does not log bestelling_geplaatst when the Firestore write fails', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'));
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-place-order-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the unpriced-items note and excludes a custom-size item from the total', () => {
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
            <SeedCustom />
            <CartPanel />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByTestId('seed-custom-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));

    expect(screen.getByTestId('cart-total')).toHaveTextContent('€ 0,00');
    expect(screen.getByTestId('cart-unpriced-note')).toHaveTextContent('+ 1 artikel, prijs volgt na offerte');
    expect(screen.getByText('Prijs op aanvraag')).toBeInTheDocument();
  });

  it('writes breedte/hoogte and a null prijs to the bestelline for a custom-size cart item', async () => {
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
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <SeedCustom />
            <CartPanel />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByTestId('seed-custom-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(addDocMock).toHaveBeenNthCalledWith(
      2,
      { path: ['bestelheaders', 'header-1', 'bestellines'] },
      { kunstwerkId: 'kw-2', maatId: '', materiaalId: 'mat-2', prijs: null, quantity: 1, breedte: 90, hoogte: 140 }
    );
  });
});
