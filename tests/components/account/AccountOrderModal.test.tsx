import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AccountOrderModal } from '@/components/account/AccountOrderModal';
import type { DisplayOrder } from '@/lib/useAllOrders';
import type { Kunstwerk, Materiaal, Maat } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Hotel paneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Extra diepte en stevigheid.' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];

function renderModal(order: DisplayOrder | null) {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AccountOrderModal
        order={order}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
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
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
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
      description: '',
      lines: [
        { id: 'line-2', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
      ],
    });
    const line = screen.getByTestId('account-order-modal-line-line-2');
    expect(line).toHaveTextContent('90×140 cm');
    expect(line).toHaveTextContent('Prijs op aanvraag');
  });

  it('shows the order id in the modal header', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    expect(screen.getByTestId('modal-header')).toHaveTextContent('GD-00001');
  });

  it('caps the order-lines list height so it scrolls independently of the modal frame', () => {
    renderModal({
      id: 'GD-00001',
      date: '1-7-2026',
      time: '14:30',
      description: '',
      lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 2 }],
    });
    const list = screen.getByTestId('account-order-modal-line-line-1').closest('ul');
    expect(list?.className).toMatch(/max-h-72/);
    expect(list?.className).toMatch(/overflow-y-auto/);
  });
});
