import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProductModal } from '@/components/ProductModal';
import { CartProvider, useCart } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Segment, Stijl, Onderwerp } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import messages from '../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const logActiviteitMock = vi.fn();

let authUser: Record<string, unknown> | null = null;
let bestelinstellingenData: unknown = null;

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromCustomer: (
    user: { uid: string; email: string | null; companyName: string | null; contactPerson: string | null } | null
  ) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.companyName ?? user.contactPerson ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

const KUNSTWERK: Kunstwerk = {
  id: 'kw-1',
  foto: 'https://example.com/kw-1.jpg',
  naam: 'Hotel paneel',
  kunstenaarId: null,
  segmentIds: ['seg-1'],
  materiaalIds: ['mat-1', 'mat-2'],
  maatIds: ['maat-1', 'maat-2'],
  omschrijvingNl: 'Wellness paneel',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
const KUNSTWERK_PRIJZEN = [
  { materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 },
  { materiaalId: 'mat-1', maatId: 'maat-2', prijs: 200 },
  { materiaalId: 'mat-2', maatId: 'maat-1', prijs: 175 },
  { materiaalId: 'mat-2', maatId: 'maat-2', prijs: 225 },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Lichtgewicht en flexibel voor grote oppervlaktes.' },
];
const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
];
const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-2', omschrijving: 'Acryl' },
];
const SEGMENTEN: Segment[] = [{ id: 'seg-1', omschrijving: 'Hotel' }];
const STIJLEN: Stijl[] = [{ id: 'stijl-1', omschrijving: 'Abstract' }];
const ONDERWERPEN: Onderwerp[] = [{ id: 'onderwerp-1', omschrijving: 'Bloemen' }];
const MATERIAALLOOS_KUNSTWERK: Kunstwerk = {
  id: 'kw-akoestisch',
  foto: 'https://example.com/akoestisch.jpg',
  naam: 'Akoestisch paneel',
  kunstenaarId: null,
  segmentIds: [],
  materiaalIds: [],
  maatIds: [],
  prijsPerM2: 180,
  omschrijvingNl: 'Verbetert de akoestiek en geeft een warme, moderne uitstraling.',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
const MAATLOOS_MET_MATERIAAL_KUNSTWERK: Kunstwerk = {
  id: 'kw-veiligheidsglas-per-m2',
  foto: 'https://example.com/veiligheidsglas.jpg',
  naam: '4mm veiligheidsglas per m2',
  kunstenaarId: null,
  segmentIds: [],
  materiaalIds: ['mat-1'],
  maatIds: [],
  prijsPerM2: 65,
  omschrijvingNl: 'Op maat gezaagd 4mm veiligheidsglas.',
  omschrijvingFr: '',
  omschrijvingDe: '',
  omschrijvingEn: '',
};
// Bad-data fixture: materiaalIds empty (materiaalloos) but maatIds non-empty, which the admin
// form itself never writes (buildKunstwerkData in KunstwerkenSection.tsx always force-clears
// maatIds to [] whenever isMateriaalloos). isMaatloos must still treat this as maatloos so a
// row written some other way (direct API call, migration, hand edit) doesn't render as an
// unorderable product with no visible select, no price and a permanently disabled button.
const MATERIAALLOOS_MET_ONVERWACHTE_MAATIDS_KUNSTWERK: Kunstwerk = {
  ...MATERIAALLOOS_KUNSTWERK,
  id: 'kw-materiaalloos-bad-data',
  maatIds: ['maat-1', 'maat-2'],
};
const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-open',
    naam: 'Open Artiest',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: [],
  },
  {
    id: 'ka-exclusief',
    naam: 'Exclusieve Artiest',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: ['ander-klant-uid'],
  },
  {
    id: 'ka-eigen',
    naam: 'Eigen Artiest',
    foto: null,
    omschrijvingNl: '',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    exclusieveKlantIds: ['ander-klant-uid'],
  },
];

function renderModal(
  onClose: () => void = () => {},
  kunstwerk: Kunstwerk | null = KUNSTWERK,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS,
  segmenten: Segment[] | null = SEGMENTEN,
  stijlen: Stijl[] | null = STIJLEN,
  onderwerpen: Onderwerp[] | null = ONDERWERPEN,
  variant: 'dialog' | 'preview' = 'dialog',
  prijzen: { materiaalId: string; maatId: string; prijs: number }[] = KUNSTWERK_PRIJZEN
) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <ProductModal
            variant={variant}
            kunstwerk={kunstwerk}
            prijzen={prijzen}
            materialen={MATERIALEN}
            maten={MATEN}
            materiaalsoorten={MATERIAALSOORTEN}
            kunstenaars={kunstenaars}
            segmenten={segmenten}
            stijlen={stijlen}
            onderwerpen={onderwerpen}
            onClose={onClose}
          />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  authUser = null;
  bestelinstellingenData = null;
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/me?type=klant') {
      return { ok: true, json: async () => ({ user: authUser }) };
    }
    if (url === '/api/instellingen/bestelinstellingen') {
      return { ok: true, json: async () => bestelinstellingenData };
    }
    return { ok: true, json: async () => null };
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductModal', () => {
  const MATERIAALSOORTEN_MET_EIGEN_MAAT: Materiaalsoort[] = [
    { id: 'soort-1', omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
    { id: 'soort-2', omschrijving: 'Acryl', staatEigenMaatToe: true, maxBreedte: 200, maxHoogte: 300 },
  ];

  it('renders nothing when kunstwerk is null', () => {
    renderModal(() => {}, null);
    expect(screen.queryByTestId('product-modal')).not.toBeInTheDocument();
  });

  it('disables the confirm button and explains why for a kunstwerk exclusive to another klant', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-exclusief' });
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    expect(screen.getByTestId('product-modal-order-blocked')).toHaveTextContent(
      'Dit kunstwerk is exclusief voorbehouden aan een andere klant.'
    );
  });

  it('does not block ordering for a kunstwerk with no kunstenaar or an open one', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: null });
    expect(screen.queryByTestId('product-modal-order-blocked')).not.toBeInTheDocument();
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-open' });
    expect(screen.queryByTestId('product-modal-order-blocked')).not.toBeInTheDocument();
  });

  it('keeps a legacy kunstwerk document without a kunstenaarId field orderable', () => {
    // Zoals useApiCollection het via de API leest: het veld ontbreekt gewoon.
    const { kunstenaarId: _weg, ...legacyKunstwerk } = KUNSTWERK;
    renderModal(() => {}, legacyKunstwerk as Kunstwerk);
    expect(screen.queryByTestId('product-modal-order-blocked')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-confirm')).not.toBeDisabled();
  });

  it('fails closed while the kunstenaars collection has not loaded yet', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-open' }, null);
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    expect(screen.getByTestId('product-modal-order-blocked')).toHaveTextContent(
      'Dit kunstwerk kan op dit moment niet besteld worden. Probeer het later opnieuw.'
    );
  });

  it('fails closed for a kunstenaarId that no longer exists in the loaded kunstenaars', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-verwijderd' });
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    expect(screen.getByTestId('product-modal-order-blocked')).toHaveTextContent(
      'Dit kunstwerk kan op dit moment niet besteld worden. Probeer het later opnieuw.'
    );
  });

  it("blocks the kunstenaar's own linked klant account from ordering their own exclusive work when it isn't explicitly listed", async () => {
    // Mirrors resolveOrderRight's "no automatic artist-can-always-order-own-work bypass"
    // coverage: being the artist behind a kunstwerk grants no special access anymore, only
    // an explicit entry in exclusieveKlantIds does.
    vi.useRealTimers();
    authUser = { id: 'kunstenaar-uid', email: 'ka@example.com', status: 'Goedgekeurd', companyName: 'Atelier' };
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: 'ka-eigen' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    expect(screen.getByTestId('product-modal-order-blocked')).toHaveTextContent(
      'Dit kunstwerk is exclusief voorbehouden aan een andere klant.'
    );
  });

  it('shows the resolved description, defaults to the first materiaal/maat, and the matching price', () => {
    renderModal();
    expect(screen.getByText('Wellness paneel')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-materiaal')).toHaveValue('mat-1');
    expect(screen.getByTestId('product-modal-maat')).toHaveValue('maat-1');
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 150,00');
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(1);
  });

  it('defaults to the 4mm Veiligheidsglas materiaal when available, instead of the first-listed materiaal', () => {
    const MATERIALEN_ACRYL_EERST: Materiaal[] = [
      { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Lichtgewicht en flexibel voor grote oppervlaktes.' },
      { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Extra diepte en stevigheid voor een indrukwekkend effect.' },
    ];
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={{ ...KUNSTWERK, materiaalIds: ['mat-2', 'mat-1'] }}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN_ACRYL_EERST}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('product-modal-materiaal')).toHaveValue('mat-1');
  });

  it('updates the shown price when a different materiaal or maat is chosen', () => {
    renderModal();
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: 'maat-2' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 200,00');
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 225,00');
  });

  it('only lists the materialen this kunstwerk actually offers', () => {
    renderModal();
    const options = screen.getByTestId('product-modal-materiaal').querySelectorAll('option');
    expect(options).toHaveLength(2);
  });

  it('includes the materiaalsoort name alongside the dikte in each materiaal option', () => {
    renderModal();
    const options = screen.getByTestId('product-modal-materiaal').querySelectorAll('option');
    expect(options[0]).toHaveTextContent('4mm Veiligheidsglas');
    expect(options[1]).toHaveTextContent('3mm Acryl');
  });

  it("shows the selected materiaal's own omschrijving below the select, updating when the choice changes", () => {
    renderModal();
    expect(screen.getByTestId('product-modal-materiaal-omschrijving')).toHaveTextContent(
      'Extra diepte en stevigheid voor een indrukwekkend effect.'
    );
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    expect(screen.getByTestId('product-modal-materiaal-omschrijving')).toHaveTextContent(
      'Lichtgewicht en flexibel voor grote oppervlaktes.'
    );
  });

  it('increments and decrements quantity, never below the effective minimum', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(1);
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(3);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByTestId('product-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByTestId('product-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adds the chosen kunstwerk/materiaal/maat/price/quantity to the cart, shows confirmed state, then closes', () => {
    const onClose = vi.fn();

    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }

    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={onClose}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );

    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: 'maat-2' } });
    fireEvent.click(screen.getByTestId('product-modal-quantity-plus'));
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-1',
      materiaalId: 'mat-1',
      maatId: 'maat-2',
      maatLabel: '60×90 cm',
      prijs: 200,
      quantity: 2,
    });

    expect(screen.getByTestId('product-modal-confirm')).toHaveTextContent('Toegevoegd!');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale close-timer from a previous kunstwerk affect the newly shown modal', () => {
    const onClose = vi.fn();

    const { rerender } = render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={onClose}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByTestId('product-modal-confirm'));
    expect(screen.getByTestId('product-modal-confirm')).toHaveTextContent('Toegevoegd!');

    const NEXT_KUNSTWERK: Kunstwerk = { ...KUNSTWERK, id: 'kw-2', omschrijvingNl: 'Ander kunstwerk' };

    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={null}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={onClose}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    rerender(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={NEXT_KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={onClose}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );

    expect(screen.getByTestId('product-modal-confirm')).toHaveTextContent('Toevoegen');

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('product-modal')).toBeInTheDocument();
  });

  it('exposes dialog semantics for assistive tech', () => {
    renderModal();
    const modal = screen.getByTestId('product-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus into the modal (the close button) when it opens', () => {
    renderModal();
    expect(screen.getByTestId('product-modal-close')).toHaveFocus();
  });

  it('traps Tab focus within the modal, wrapping from the last to the first focusable element', () => {
    renderModal();
    const closeButton = screen.getByTestId('product-modal-close');
    const confirmButton = screen.getByTestId('product-modal-confirm');

    confirmButton.focus();
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
  });

  it('shows the photo', () => {
    renderModal();
    expect(screen.getByTestId('product-image')).toBeInTheDocument();
  });

  it('shows the full artwork on a dark, gold-bordered panel instead of a cropped white one', () => {
    renderModal();
    const image = screen.getByTestId('product-image');
    expect(image).toHaveClass('border-gold/50');
    expect(image).toHaveClass('bg-ink');
  });

  it('logs mandje_toegevoegd with the logged-in klant when confirmed', async () => {
    vi.useRealTimers();
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd', companyName: 'Testbedrijf BV' };
    renderModal();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'mandje_toegevoegd',
      { id: 'uid-1', email: 'klant@example.com', naam: 'Testbedrijf BV' },
      'Hotel paneel'
    );
  });

  it('logs mandje_toegevoegd as Onbekend for an anonymous visitor', async () => {
    vi.useRealTimers();
    renderModal();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'mandje_toegevoegd',
      { id: null, email: 'Onbekend', naam: 'Onbekend' },
      'Hotel paneel'
    );
  });

  it('does not offer an "eigen maat opgeven" option for a materiaal whose soort does not allow it', () => {
    renderModal();
    const options = Array.from(
      screen.getByTestId('product-modal-maat').querySelectorAll('option')
    ).map((option) => option.textContent);
    expect(options).not.toContain('Eigen maat opgeven');
  });

  it('offers and selects "eigen maat opgeven", showing breedte/hoogte inputs and "Prijs op aanvraag"', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-hoogte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('Prijs op aanvraag');
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    expect(screen.queryByTestId('product-modal-prijs-help-popover')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-modal-prijs-help'));
    expect(screen.getByTestId('product-modal-prijs-help-popover')).toHaveTextContent('eigen (afwijkende) maat');
  });

  it('does not show a help icon next to a resolved, fixed price', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('product-modal-prijs')).not.toHaveTextContent('Prijs op aanvraag');
    expect(screen.queryByTestId('product-modal-prijs-help')).not.toBeInTheDocument();
  });

  it('shows a lead-time warning and no max error for an oversized custom veiligheidsglas size', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '400' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '500' } });
    expect(screen.getByTestId('product-modal-maat-levertijd-warning')).toHaveTextContent(
      'Let op: bij deze maat is de levertijd minimaal 3 maanden.'
    );
    expect(screen.queryByTestId('product-modal-maat-custom-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-confirm')).not.toBeDisabled();
  });

  it('gives the custom breedte and hoogte inputs matching min-w-0 flex-1 wrappers so they split the row evenly', () => {
    renderModal(() => {}, MATERIAALLOOS_KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'dialog', []);
    const breedteWrapper = screen.getByTestId('product-modal-maat-custom-breedte').closest('label');
    const hoogteWrapper = screen.getByTestId('product-modal-maat-custom-hoogte').closest('label');
    expect(breedteWrapper?.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(breedteWrapper?.className).toMatch(/(^|\s)flex-1(\s|$)/);
    expect(hoogteWrapper?.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    expect(hoogteWrapper?.className).toMatch(/(^|\s)flex-1(\s|$)/);
  });

  it('shows a max-size error and disables confirm for an oversized custom Acryl size', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '250' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '280' } });
    expect(screen.getByTestId('product-modal-maat-custom-error')).toHaveTextContent(
      'Deze maat is te groot. Maximaal 200×300 cm.'
    );
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
  });

  it('adds a valid custom-size line to the cart with a null price and logs mandje_eigen_maat_toegevoegd', async () => {
    vi.useRealTimers();
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '90' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '140' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-1',
      materiaalId: 'mat-1',
      maatId: '',
      breedte: 90,
      hoogte: 140,
      maatLabel: '90×140 cm (eigen maat)',
      prijs: null,
      quantity: 1,
    });
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'mandje_eigen_maat_toegevoegd',
      { id: null, email: 'Onbekend', naam: 'Onbekend' },
      'Hotel paneel'
    );
  });

  it('resets to a standard maat when switching to a materiaal whose soort does not allow eigen maat', () => {
    const MATERIAALSOORTEN_MIXED: Materiaalsoort[] = [
      { id: 'soort-1', omschrijving: 'Veiligheidsglas', staatEigenMaatToe: true, levertijdMaandenEigenMaat: 3 },
      { id: 'soort-2', omschrijving: 'Acryl' },
    ];
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MIXED}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    expect(screen.queryByTestId('product-modal-maat-custom-breedte')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat')).toHaveValue('maat-1');
  });

  it('hides the materiaal and maat selects for a materiaalloos kunstwerk, showing free-size inputs directly', () => {
    renderModal(() => {}, MATERIAALLOOS_KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'dialog', []);
    expect(screen.queryByTestId('product-modal-materiaal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-maat')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-hoogte')).toBeInTheDocument();
  });

  it('computes and shows a live price for a materiaalloos kunstwerk based on the entered size and prijsPerM2', () => {
    renderModal(() => {}, MATERIAALLOOS_KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'dialog', []);
    expect(screen.queryByTestId('product-modal-prijs')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 360,00');
  });

  it('applies the ingelogde klant\'s prijsgroep korting to the live prijsPerM2 preview', async () => {
    vi.useRealTimers();
    authUser = {
      id: 'uid-1',
      email: 'klant@example.com',
      status: 'Goedgekeurd',
      companyName: 'Testbedrijf BV',
      prijsgroep: { kortingspercentage: 10, opslagpercentage: null },
    };
    renderModal(() => {}, MATERIAALLOOS_KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'dialog', []);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    // basisprijs 100cm x 200cm x 180/m2 = 360, min 10% prijsgroep korting = 324
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 324,00');
  });

  it('adds a materiaalloos item to the cart with the computed price and no material/maat, logging mandje_toegevoegd', async () => {
    vi.useRealTimers();
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={MATERIAALLOOS_KUNSTWERK}
              prijzen={[]}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-akoestisch',
      materiaalId: '',
      materiaalLabel: 'Akoestische stof',
      maatId: '',
      breedte: 100,
      hoogte: 200,
      maatLabel: '100×200 cm (eigen maat)',
      prijs: 360,
      quantity: 1,
    });
    expect(logActiviteitMock).toHaveBeenCalledWith('mandje_toegevoegd', {
      id: null,
      email: 'Onbekend',
      naam: 'Onbekend',
    });
  });

  it('shows the materiaal select but hides the maat select for a maatloos kunstwerk that still has a materiaal, showing free-size inputs', () => {
    renderModal(() => {}, MAATLOOS_MET_MATERIAAL_KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'dialog', []);
    expect(screen.getByTestId('product-modal-materiaal')).toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-maat')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-hoogte')).toBeInTheDocument();
  });

  it('computes and shows a live price for a maatloos-met-materiaal kunstwerk based on the entered size and prijsPerM2', () => {
    renderModal(() => {}, MAATLOOS_MET_MATERIAAL_KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'dialog', []);
    expect(screen.queryByTestId('product-modal-prijs')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 130,00');
  });

  it('still treats a materiaalloos kunstwerk as maatloos even if maatIds is unexpectedly non-empty (bad/legacy data), showing free-size inputs and a price', () => {
    renderModal(() => {}, MATERIAALLOOS_MET_ONVERWACHTE_MAATIDS_KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'dialog', []);
    expect(screen.queryByTestId('product-modal-materiaal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-maat')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-maat-custom-hoogte')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 360,00');
  });

  it('adds a maatloos-met-materiaal item to the cart with the chosen materiaal, computed price and entered size', async () => {
    vi.useRealTimers();
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={MAATLOOS_MET_MATERIAAL_KUNSTWERK}
              prijzen={[]}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-breedte'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('product-modal-maat-custom-hoogte'), { target: { value: '200' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByTestId('product-modal-confirm'));

    const items = JSON.parse(screen.getByTestId('probe').textContent ?? '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kunstwerkId: 'kw-veiligheidsglas-per-m2',
      materiaalId: 'mat-1',
      materiaalLabel: '4mm Veiligheidsglas',
      maatId: '',
      breedte: 100,
      hoogte: 200,
      maatLabel: '100×200 cm (eigen maat)',
      prijs: 130,
      quantity: 1,
    });
  });

  it('labels the shown price with "Prijs" for a normal kunstwerk with a chosen materiaal/maat', () => {
    renderModal();
    expect(screen.getByText('Prijs')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('€ 150,00');
  });

  it('labels "Prijs op aanvraag" with the same "Prijs" heading for an eigen-maat kunstwerk', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN_MET_EIGEN_MAAT}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByTestId('product-modal-maat'), { target: { value: '__eigen_maat__' } });
    expect(screen.getByText('Prijs')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-prijs')).toHaveTextContent('Prijs op aanvraag');
  });

  async function flushMicrotasks() {
    // The suite defaults to fake timers (see the top-level beforeEach) for the
    // CONFIRM_FEEDBACK_MS close-timer tests. The tests below don't touch that
    // timer, but they DO need this setTimeout(0) to actually fire so the
    // pending fetch()es (useApiRecord/useCustomerAuth) can resolve, so switch
    // to real timers before flushing.
    vi.useRealTimers();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function renderTree(kunstwerk: Kunstwerk | null) {
    return (
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              kunstwerk={kunstwerk}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
  }

  // These 3 tests mount with kunstwerk=null first and only rerender with the
  // real kunstwerk after the API data has resolved. This mirrors the
  // real-app lifecycle described by the kunstwerk-reset effect's comment in
  // ProductModal.tsx (the popup is closed, i.e. kunstwerk is null, while
  // useApiRecord/useCustomerAuth resolve; it only becomes non-null once the
  // customer opens a product). Mounting directly with a non-null kunstwerk
  // (like renderModal() does) would fire the reset effect before the async
  // data arrives, which is not what these tests are checking.
  it('prefills quantity with the global minimale afname when there is no logged-in klant', async () => {
    bestelinstellingenData = { minimaleAfname: 5 };
    const { rerender } = render(renderTree(null));
    await flushMicrotasks();
    rerender(renderTree(KUNSTWERK));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(5);
  });

  it('prefills quantity with the klant override when it differs from the global minimum', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd', minimaleAfname: 8 };
    bestelinstellingenData = { minimaleAfname: 3 };
    const { rerender } = render(renderTree(null));
    await flushMicrotasks();
    rerender(renderTree(KUNSTWERK));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(8);
  });

  it('falls back to the global minimum when the klant has no override', async () => {
    authUser = { id: 'uid-1', email: 'klant@example.com', status: 'Goedgekeurd', minimaleAfname: null };
    bestelinstellingenData = { minimaleAfname: 4 };
    const { rerender } = render(renderTree(null));
    await flushMicrotasks();
    rerender(renderTree(KUNSTWERK));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(4);
  });

  it('shows an error and disables confirm when the typed quantity is below the minimum', async () => {
    bestelinstellingenData = { minimaleAfname: 5 };
    renderModal();
    await flushMicrotasks();
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '2' } });
    expect(screen.getByTestId('product-modal-quantity-error')).toHaveTextContent('Minimaal 5 stuks');
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
  });

  it('re-enables confirm once the typed quantity meets the minimum', async () => {
    bestelinstellingenData = { minimaleAfname: 5 };
    renderModal();
    await flushMicrotasks();
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '5' } });
    expect(screen.queryByTestId('product-modal-quantity-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal-confirm')).not.toBeDisabled();
  });

  it('shows an error when the quantity field is cleared', async () => {
    bestelinstellingenData = { minimaleAfname: 5 };
    renderModal();
    await flushMicrotasks();
    fireEvent.change(screen.getByTestId('product-modal-quantity-value'), { target: { value: '' } });
    expect(screen.getByTestId('product-modal-quantity-error')).toBeInTheDocument();
    expect(screen.getByTestId('product-modal-confirm')).toBeDisabled();
  });

  it('the minus button never goes below the effective minimum', async () => {
    bestelinstellingenData = { minimaleAfname: 3 };
    renderModal();
    await flushMicrotasks();
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    fireEvent.click(screen.getByTestId('product-modal-quantity-minus'));
    expect(screen.getByTestId('product-modal-quantity-value')).toHaveValue(3);
  });

  it('shows artiest, collectie, stijl and onderwerp when the kunstwerk has them', () => {
    renderModal(() => {}, {
      ...KUNSTWERK,
      kunstenaarId: 'ka-open',
      segmentIds: ['seg-1'],
      stijlIds: ['stijl-1'],
      onderwerpIds: ['onderwerp-1'],
    });
    expect(screen.getByTestId('product-modal-artiest')).toHaveTextContent('Open Artiest');
    expect(screen.getByTestId('product-modal-kunstwerknaam')).toHaveTextContent('Hotel paneel');
    expect(screen.getByTestId('product-modal-collecties')).toHaveTextContent('Hotel');
    expect(screen.getByTestId('product-modal-stijl')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('product-modal-onderwerp')).toHaveTextContent('Bloemen');
  });

  it('omits the whole info block when the kunstwerk has no artiest, collectie, stijl or onderwerp', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: null, segmentIds: [], stijlIds: [], onderwerpIds: [] });
    expect(screen.queryByTestId('product-modal-meta')).not.toBeInTheDocument();
  });

  it('only shows the fields that have data, omitting the rest', () => {
    renderModal(() => {}, { ...KUNSTWERK, kunstenaarId: null, segmentIds: ['seg-1'], stijlIds: [], onderwerpIds: [] });
    expect(screen.getByTestId('product-modal-collecties')).toHaveTextContent('Hotel');
    expect(screen.queryByTestId('product-modal-artiest')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-stijl')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-onderwerp')).not.toBeInTheDocument();
  });

  it('preview variant: renders inline without a backdrop, close button or dialog role', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    expect(screen.queryByTestId('product-modal-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-modal-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modal')).not.toHaveAttribute('role', 'dialog');
  });

  it('preview variant: never uses the viewport-based sm: breakpoint for its two-column layout (that caused the sidebar squeeze bug)', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    expect(screen.getByTestId('product-modal').className).not.toMatch(/(^|\s)sm:grid-cols-2(\s|$)/);
  });

  it('dialog variant: keeps the two-column layout at the sm breakpoint, since it is centered in the full viewport', () => {
    renderModal();
    const panel = screen.getByTestId('product-modal-backdrop').nextElementSibling;
    expect(panel?.className).toMatch(/(^|\s)sm:grid-cols-2(\s|$)/);
  });

  it('preview variant: wraps the panel in a container-query frame with width-driven column markers', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    const panel = screen.getByTestId('product-modal');
    expect(panel.parentElement).toHaveClass('pm-preview-frame');
    expect(panel.className).toMatch(/(^|\s)pm-preview-panel(\s|$)/);
    expect(screen.getByTestId('product-image').className).toMatch(/(^|\s)pm-preview-image(\s|$)/);
  });

  it('dialog variant: does not carry the preview container-query markers', () => {
    renderModal();
    const panel = screen.getByTestId('product-modal-backdrop').nextElementSibling as HTMLElement;
    expect(panel.className).not.toMatch(/pm-preview/);
    expect(screen.getByTestId('product-image').className).not.toMatch(/pm-preview/);
  });

  it('preview variant: disables the confirm button and never adds to the cart', () => {
    function Probe() {
      const { items } = useCart();
      return <div data-testid="probe">{JSON.stringify(items)}</div>;
    }
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <CustomerAuthProvider>
          <CartProvider>
            <ProductModal
              variant="preview"
              kunstwerk={KUNSTWERK}
              prijzen={KUNSTWERK_PRIJZEN}
              materialen={MATERIALEN}
              maten={MATEN}
              materiaalsoorten={MATERIAALSOORTEN}
              kunstenaars={KUNSTENAARS}
              segmenten={SEGMENTEN}
              stijlen={STIJLEN}
              onderwerpen={ONDERWERPEN}
              onClose={() => {}}
            />
            <Probe />
          </CartProvider>
        </CustomerAuthProvider>
      </NextIntlClientProvider>
    );
    const confirmButton = screen.getByTestId('product-modal-confirm');
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveTextContent('Bestellen niet mogelijk in dit voorbeeld');
    fireEvent.click(confirmButton);
    expect(screen.getByTestId('probe')).toHaveTextContent('[]');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('preview variant: keeps the materiaal/maat selects interactive', () => {
    renderModal(() => {}, KUNSTWERK, KUNSTENAARS, SEGMENTEN, STIJLEN, ONDERWERPEN, 'preview');
    fireEvent.change(screen.getByTestId('product-modal-materiaal'), { target: { value: 'mat-2' } });
    expect(screen.getByTestId('product-modal-materiaal')).toHaveValue('mat-2');
  });
});
