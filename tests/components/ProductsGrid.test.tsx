import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import { CartProvider } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const getDocsMock = vi.fn();
const getDocMock = vi.fn();
const onAuthStateChangedMock = vi.fn();
const logActiviteitMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docsData.length === 0,
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

const SEGMENTEN = [
  { id: 'seg-hotel', data: { omschrijving: 'Hotel' } },
  { id: 'seg-wellness', data: { omschrijving: 'Wellness' } },
];
const KUNSTWERKEN = [
  {
    id: 'kw-1',
    data: {
      foto: 'https://example.com/kw-1.jpg',
      segmentIds: ['seg-hotel'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      formaat: 'staand',
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
      kunstenaarId: 'ka-1',
      omschrijvingNl: 'Hotel paneel',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
  {
    id: 'kw-2',
    data: {
      foto: 'https://example.com/kw-2.jpg',
      segmentIds: ['seg-wellness'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      formaat: 'liggend',
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 200 }],
      omschrijvingNl: 'Wellness paneel',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
  {
    id: 'kw-3',
    data: {
      foto: 'https://example.com/kw-3.jpg',
      segmentIds: ['seg-hotel', 'seg-wellness'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      formaat: 'vierkant',
      prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 175 }],
      omschrijvingNl: 'Kunstwerk in beide segmenten',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  },
];
const MATERIALEN = [
  { id: 'mat-1', data: { materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' } },
];
const MATEN = [{ id: 'maat-1', data: { breedte: 40, hoogte: 60 } }];
const KUNSTENAARS = [
  {
    id: 'ka-1',
    data: {
      naam: 'Sabrina Glasser',
      foto: null,
      omschrijvingNl: 'Werkt met gesmolten glas.',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
      verkooprecht: 'open',
      klantId: null,
      exclusiefVoorKlantId: null,
    },
  },
];

function mockCollections() {
  const data: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: MATERIALEN,
    maten: MATEN,
    kunstenaars: KUNSTENAARS,
  };
  getDocsMock.mockImplementation((collectionRef: { name: string }) =>
    Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []))
  );
}

function renderProductsGrid() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductsGrid />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  getDocsMock.mockReset();
  getDocMock.mockReset();
  onAuthStateChangedMock.mockReset();
  logActiviteitMock.mockReset();
  mockCollections();
  getDocMock.mockResolvedValue({ exists: () => false });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
});

describe('ProductsGrid', () => {
  it('shows all 3 kunstwerken and 3 filter buttons (all + 2 segments) by default', async () => {
    renderProductsGrid();
    expect(await screen.findAllByTestId('product-card')).toHaveLength(3);
    expect(screen.getByTestId('filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-seg-hotel')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('filter-seg-wellness')).toHaveTextContent('Wellness');
  });

  it("shows only that segment's kunstwerken after clicking its filter button, including one shared across segments", async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('filter-seg-wellness'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // kw-2 and kw-3
  });

  it('returns to all kunstwerken after clicking the "Alle" filter again', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('filter-seg-wellness'));
    fireEvent.click(screen.getByTestId('filter-all'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(3);
  });

  it('marks the active filter button with aria-pressed', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getByTestId('filter-seg-hotel')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the product modal with the resolved description when a card is clicked', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
    fireEvent.click(cards[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
  });

  it('closes the product modal when its backdrop is clicked', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    fireEvent.click(cards[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
  });

  it('opens the product modal when Enter or Space is pressed on a focused card', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    fireEvent.keyDown(cards[0], { key: 'Enter' });
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));

    fireEvent.keyDown(cards[1], { key: ' ' });
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
  });

  it('shows a watermark overlay on every product card photo', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getAllByTestId('watermark-overlay').length).toBeGreaterThanOrEqual(3);
  });

  it('logs kunstwerk_bekeken with the logged-in klant when a card is clicked', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ status: 'Goedgekeurd', companyName: 'Testbedrijf BV' }),
    });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    await waitFor(() => expect(getDocMock).toHaveBeenCalled());
    fireEvent.click(cards[0]);
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('kunstwerk_bekeken', {
        id: 'uid-1',
        email: 'klant@example.com',
        naam: 'Testbedrijf BV',
      })
    );
  });

  it('does not log kunstwerk_bekeken for an anonymous visitor', async () => {
    renderProductsGrid();
    const cards = await screen.findAllByTestId('product-card');
    fireEvent.click(cards[0]);
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows a breadcrumb that ends on "Collecties" when no segment is selected, and on the segment name once one is', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('breadcrumb-item-0')).toHaveTextContent('Home');
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveTextContent('Collecties');
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveTextContent('Collecties');
    expect(screen.getByTestId('breadcrumb-item-1')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('breadcrumb-item-2')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('breadcrumb-item-2')).toHaveAttribute('aria-current', 'page');
  });

  it('filters by kunstenaar and shows the artist info banner with their description', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.focus(screen.getByTestId('kunstenaar-filter'));
    fireEvent.click(screen.getByTestId('kunstenaar-filter-option-ka-1'));
    expect(screen.getByTestId('kunstenaar-banner')).toHaveTextContent('Sabrina Glasser');
    expect(screen.getByTestId('kunstenaar-banner')).toHaveTextContent('Werkt met gesmolten glas.');
    expect(screen.getAllByTestId('product-card')).toHaveLength(1);
  });

  it('filters by formaat, combines with segment via AND, and shows counts per formaat option', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');

    expect(screen.getByTestId('facet-formaat-option-staand')).toHaveTextContent('1');
    expect(screen.getByTestId('facet-formaat-option-liggend')).toHaveTextContent('1');
    expect(screen.getByTestId('facet-formaat-option-vierkant')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('facet-formaat-option-vierkant'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1); // only kw-3

    fireEvent.click(screen.getByTestId('filter-seg-wellness'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1); // kw-3 is in both seg-wellness and vierkant

    fireEvent.click(screen.getByTestId('facet-formaat-option-vierkant'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2); // seg-wellness alone: kw-2 and kw-3
  });
});
