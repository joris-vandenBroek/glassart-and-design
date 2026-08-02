import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductsGrid } from '@/components/ProductsGrid';
import { CartProvider } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: vi.fn(),
  actorFromCustomer: () => ({ id: null, email: 'Onbekend', naam: 'Onbekend' }),
}));

const SEGMENTEN = [
  { id: 'seg-hotel', omschrijving: 'Hotel' },
  { id: 'seg-wellness', omschrijving: 'Wellness' },
];
const KUNSTWERKEN = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Kunstwerk 1',
    segmentIds: ['seg-hotel'],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    stijlIds: [],
    onderwerpIds: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
  {
    id: 'kw-2',
    foto: 'https://example.com/kw-2.jpg',
    naam: 'Kunstwerk 2',
    segmentIds: ['seg-wellness'],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    stijlIds: [],
    onderwerpIds: [],
    omschrijvingNl: 'Wellness paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

let collections: Record<string, unknown[]> = {};

function mockDesktopMediaQuery(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
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
  fetchMock.mockReset();
  // Re-stub fetch each test: the module-level vi.stubGlobal only runs once, but the
  // afterEach below calls vi.unstubAllGlobals() (needed to reset matchMedia between
  // tests), which also undoes the fetch stub after the first test. Without this,
  // every test after the first hits the real global fetch with a relative URL and throws.
  vi.stubGlobal('fetch', fetchMock);
  collections = {
    segmenten: SEGMENTEN,
    kunstwerken: KUNSTWERKEN,
    materialen: [],
    maten: [],
    materiaalsoorten: [],
    kunstenaars: [],
    stijlen: [],
    onderwerpen: [],
  };
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: null }) };
    }
    if (url === '/api/instellingen/bestelinstellingen') {
      return { ok: true, json: async () => null };
    }
    if (url === '/api/kunstwerken/prijzen') {
      return { ok: true, json: async () => ({}) };
    }
    const resource = url.replace(/^\/api\//, '');
    return { ok: true, json: async () => collections[resource] ?? [] };
  });
  mockDesktopMediaQuery(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProductsGrid on mobile', () => {
  it('shows the mobile filters toggle instead of the filter sidebar', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('mobile-filters-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-section-collectie')).not.toBeInTheDocument();
  });

  it('opens the filters panel with the same facet controls as desktop', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('filter-seg-hotel')).toBeInTheDocument();
  });

  it('filters live while the panel stays open, and shows the live count on the close button', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));

    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1);
    expect(screen.getByTestId('modal-footer-close')).toHaveTextContent('Toon 1 resultaat');
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('closes the panel when the "Toon resultaten" button is clicked', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    fireEvent.click(screen.getByTestId('modal-footer-close'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('clears all filters from the panel without closing it', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('mobile-clear-all-filters'));
    expect(screen.getAllByTestId('product-card')).toHaveLength(2);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('shows the active-filter count on the toggle button', async () => {
    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    expect(screen.getByTestId('mobile-filters-toggle')).not.toHaveTextContent('(');

    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    fireEvent.click(screen.getByTestId('filter-seg-hotel'));
    fireEvent.click(screen.getByTestId('modal-footer-close'));
    expect(screen.getByTestId('mobile-filters-toggle')).toHaveTextContent('(1)');
  });
});

describe('ProductsGrid switching between mobile and desktop', () => {
  it('resets the open filters panel so it does not silently reappear when returning to mobile', async () => {
    // Without the reset effect, mobileFiltersOpen would stay stale at `true` on desktop and reopen unprompted here.
    let changeHandler: (() => void) | undefined;
    const mediaQueryList = {
      matches: false,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryList));

    renderProductsGrid();
    await screen.findAllByTestId('product-card');
    fireEvent.click(screen.getByTestId('mobile-filters-toggle'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    mediaQueryList.matches = true;
    act(() => {
      changeHandler?.();
    });
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-section-collectie')).toBeInTheDocument();

    mediaQueryList.matches = false;
    act(() => {
      changeHandler?.();
    });
    expect(screen.getByTestId('mobile-filters-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });
});
