import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AccountOrderModal } from '@/components/account/AccountOrderModal';
import type { DisplayOrder } from '@/lib/useAllOrders';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import messages from '../../../messages/nl.json';

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    code: 'Hotel paneel',
    kunstenaarnr: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijvingNl: 'Extra diepte en stevigheid.', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };

function renderModal(
  order: (Omit<DisplayOrder, 'korting'> & Partial<Pick<DisplayOrder, 'korting'>>) | null,
  land: string | null = 'NL',
  btwTarieven: BtwTarieven | null = BTWTARIEVEN
) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AccountOrderModal
        order={order ? { korting: null, ...order } : null}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        land={land}
        btwTarieven={btwTarieven}
        onClose={() => {}}
      />
    </NextIntlClientProvider>
  );
}

describe('AccountOrderModal', () => {
  it('shows the resolved maat and price for a standard-size line', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    const line = screen.getByTestId('account-order-modal-line-line-1');
    expect(line).toHaveTextContent('40×60 cm');
    expect(line).toHaveTextContent('€ 150,00');
  });

  it('falls back to breedte×hoogte and "Prijs op aanvraag" for a custom-size line', () => {
    renderModal({
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-2', code: 'Hotel paneel', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    const line = screen.getByTestId('account-order-modal-line-line-2');
    expect(line).toHaveTextContent('90×140 cm');
    expect(line).toHaveTextContent('Prijs op aanvraag');
  });

  it('shows a help popover next to a "Prijs op aanvraag" line explaining why', () => {
    renderModal({
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-2', code: 'Hotel paneel', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    fireEvent.click(screen.getByTestId('account-order-modal-line-line-2-price-help'));
    expect(screen.getByTestId('account-order-modal-line-line-2-price-help-popover')).toHaveTextContent(
      'eigen (afwijkende) maat'
    );
  });

  it('shows a help popover explaining the status badge', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.queryByTestId('account-order-modal-status-help-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('account-order-modal-status-help'));
    expect(screen.getByTestId('account-order-modal-status-help-popover')).toHaveTextContent('In behandeling');
  });

  it('shows the order id in the modal header', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.getByTestId('modal-header')).toHaveTextContent('GD-00001');
  });

  it('caps the order-lines list height so it scrolls independently of the modal frame', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    const list = screen.getByTestId('account-order-modal-line-line-1').closest('ul');
    expect(list?.className).toMatch(/max-h-72/);
    expect(list?.className).toMatch(/overflow-y-auto/);
  });

  it('shows an "In behandeling" status badge for an active order', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te versturen naar drukker',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.getByTestId('account-order-modal-status')).toHaveTextContent('In behandeling');
  });

  it('shows an "Afgewezen" status badge for a rejected order', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Afgewezen',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.getByTestId('account-order-modal-status')).toHaveTextContent('Afgewezen');
  });

  it('shows the order total in the header when every line has a price', () => {
    renderModal({
      id: 'GD-00005',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 },
        { id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 50, quantity: 1 },
      ],
    });
    expect(screen.getByTestId('account-order-modal-total')).toHaveTextContent('€ 350,00');
  });

  it('subtracts a korting on the bestelheader from the total and btw, and shows it as its own row', () => {
    renderModal({
      id: 'GD-00005',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 },
        { id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 50, quantity: 1 },
      ],
      korting: 50,
    });
    // regelsom 350, korting 50 -> 300 excl. btw, btw 21% = 63, incl. btw 363
    expect(screen.getByTestId('account-order-modal-subtotaal')).toHaveTextContent('€ 350,00');
    expect(screen.getByTestId('account-order-modal-total')).toHaveTextContent('€ 300,00');
    expect(screen.getByTestId('account-order-modal-korting')).toHaveTextContent('€ 50,00');
    expect(screen.getByTestId('account-order-modal-btw')).toHaveTextContent('€ 63,00');
    expect(screen.getByTestId('account-order-modal-totaal-incl')).toHaveTextContent('€ 363,00');
  });

  it('shows no korting row or subtotaal when korting is null or 0', () => {
    renderModal({
      id: 'GD-00005',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.queryByTestId('account-order-modal-korting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-order-modal-subtotaal')).not.toBeInTheDocument();
  });

  it('shows a subtotal per line (aantal × stukprijs)', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    const line = screen.getByTestId('account-order-modal-line-line-1');
    expect(line).toHaveTextContent('2 × € 150,00');
    expect(line).toHaveTextContent('€ 300,00');
  });

  it('shows an incomplete-total placeholder instead of a wrong total when a line has no price yet', () => {
    renderModal({
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-2', code: 'Hotel paneel', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    expect(screen.getByTestId('account-order-modal-total')).toHaveTextContent('Wordt nog vastgesteld');
  });

  it('shows no total block for an order with no line detail', () => {
    renderModal({
      id: 'GD-00006',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '3 bestelregels, totaal 5 stuks',
      lines: null,
    });
    expect(screen.queryByTestId('account-order-modal-total')).not.toBeInTheDocument();
  });

  it('shows the btw percentage, btw-bedrag and totaal incl. btw', () => {
    renderModal({
      id: 'GD-00005',
      date: '1-7-2026',
      time: '14:30',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 },
        { id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 50, quantity: 1 },
      ],
    });
    // total excl. btw = 350
    expect(screen.getByTestId('account-order-modal-btw')).toHaveTextContent('21');
    expect(screen.getByTestId('account-order-modal-btw')).toHaveTextContent('€ 73,50');
    expect(screen.getByTestId('account-order-modal-totaal-incl')).toHaveTextContent('€ 423,50');
  });

  it('shows no btw block when land is null', () => {
    renderModal(
      {
        id: 'GD-00001',
        date: '1-7-2026',
        time: '14:30',
        status: 'Te beoordelen',
        description: '',
        lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
      },
      null,
      { tarieven: [{ land: 'DE', percentage: 19 }] }
    );
    expect(screen.queryByTestId('account-order-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-order-modal-totaal-incl')).not.toBeInTheDocument();
  });

  it('shows no btw block when the total itself is incomplete', () => {
    renderModal({
      id: 'GD-00002',
      date: '2-7-2026',
      time: '09:00',
      status: 'Te beoordelen',
      description: '',
      lines: [
        { id: 'line-2', code: 'Hotel paneel', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    expect(screen.queryByTestId('account-order-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-order-modal-totaal-incl')).not.toBeInTheDocument();
  });
});
