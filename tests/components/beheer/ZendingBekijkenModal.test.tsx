import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ZendingBekijkenModal } from '@/components/beheer/ZendingBekijkenModal';
import type { DrukkerZending } from '@/lib/useDrukkerZendingen';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
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
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    omschrijvingNl: 'Extra diepte en stevigheid.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];
const KLANTEN: Klant[] = [
  {
    id: 'uid-1',
    klantnr: 'KN-1',
    companyName: 'Testbedrijf BV',
    kvk: '12345678',
    contactPerson: 'Jan Jansen',
    email: 'jan@example.com',
    phone: '0612345678',
    contactPreference: 'email',
    address: 'Teststraat 1',
    postcode: '1234 AB',
    city: 'Teststad',
    land: 'NL',
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    invoiceLand: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarnr: null,
  },
  {
    id: 'uid-2',
    klantnr: 'KN-2',
    companyName: 'Tweede Klant BV',
    kvk: '87654321',
    contactPerson: 'Anne Bakker',
    email: 'anne@example.com',
    phone: '0687654321',
    contactPreference: 'email',
    address: 'Teststraat 2',
    postcode: '4321 BA',
    city: 'Teststad',
    land: 'NL',
    deliveryAddress: 'Bezorgstraat 9',
    deliveryPostcode: '9999 ZZ',
    deliveryCity: 'Bezorgstad',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    invoiceLand: '',
    status: 'Goedgekeurd',
    prijsgroepId: null,
    kunstenaarnr: null,
  },
];

const ZENDING: DrukkerZending = {
  id: 'zending-1',
  verzondenOp: new Date('2026-07-24T10:00:00Z'),
  onderwerp: 'ZD-00007 — Nieuwe order(s) voor de drukker – 24-7-2026',
  body: '== Testbedrijf BV ==',
  bestellingIds: ['GD-00201'],
  aantalKlanten: 1,
  aantalRegels: 1,
  verzondDoor: 'paul@glassartanddesign.com',
  zendingnummer: 'ZD-00007',
};

const BESTELLING_1: Bestelling = {
  id: 'header-1',
  klantnr: 'KN-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00201',
  korting: 10,
  besteldatum: '1-7-2026',
  status: 'Verstuurd naar drukker',
  lineCount: 1,
  totalQuantity: 2,
  lines: [{ id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 100, quantity: 2 }],
};

const BESTELLING_2: Bestelling = {
  id: 'header-2',
  klantnr: 'KN-2',
  companyName: 'Tweede Klant BV',
  bestelnr: 'GD-00202',
  korting: null,
  besteldatum: '1-7-2026',
  status: 'Verstuurd naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-2', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 50, quantity: 1 }],
};

function renderModal(overrides: Partial<React.ComponentProps<typeof ZendingBekijkenModal>> = {}) {
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ZendingBekijkenModal
        zending={ZENDING}
        bestellingen={[BESTELLING_1]}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        klanten={KLANTEN}
        onClose={() => {}}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

describe('ZendingBekijkenModal', () => {
  it('is not shown when zending is null', () => {
    renderModal({ zending: null });
    expect(screen.queryByTestId('zending-bekijken-modal')).not.toBeInTheDocument();
  });

  it('shows the modal title and the zendingnummer in the subtitle, and is wide', () => {
    renderModal();
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Zendinggegevens');
    expect(screen.getByTestId('modal-header')).toHaveTextContent('ZD-00007');
    expect(screen.getByTestId('modal-header').parentElement).toHaveClass('max-w-[1400px]');
  });

  it('shows the afleveradres and the regel (code, materiaal, maat, aantal) for a single-order zending, without any price', () => {
    renderModal();
    const kaart = screen.getByTestId('zending-bekijken-bestelling-header-1');
    expect(kaart).toHaveTextContent('Testbedrijf BV');
    expect(kaart).toHaveTextContent('GD-00201');
    expect(kaart).toHaveTextContent('Afleveradres: Teststraat 1, 1234 AB Teststad');
    expect(kaart).toHaveTextContent('Hotel paneel');
    expect(kaart).toHaveTextContent('4mm Veiligheidsglas — Extra diepte en stevigheid.');
    expect(kaart).toHaveTextContent('Maat: 40×60 cm · Aantal: 2');
    expect(kaart).not.toHaveTextContent('€');
  });

  it('uses the delivery address when the klant has one set, matching the mail', () => {
    renderModal({
      zending: { ...ZENDING, bestellingIds: ['GD-00202'] },
      bestellingen: [BESTELLING_2],
    });
    expect(screen.getByTestId('zending-bekijken-bestelling-header-2')).toHaveTextContent(
      'Afleveradres: Bezorgstraat 9, 9999 ZZ Bezorgstad'
    );
  });

  it('shows a tab per bestelling for a multi-order zending, and switches the visible bestelling on tab click', () => {
    renderModal({
      zending: { ...ZENDING, bestellingIds: ['GD-00201', 'GD-00202'], aantalKlanten: 2, aantalRegels: 2 },
      bestellingen: [BESTELLING_1, BESTELLING_2],
    });
    expect(screen.getByTestId('zending-bekijken-tab-GD-00201')).toBeInTheDocument();
    expect(screen.getByTestId('zending-bekijken-tab-GD-00202')).toBeInTheDocument();

    expect(screen.getByTestId('zending-bekijken-bestelling-header-1')).not.toHaveClass('hidden');
    expect(screen.getByTestId('zending-bekijken-bestelling-header-2')).toHaveClass('hidden');

    fireEvent.click(screen.getByTestId('zending-bekijken-tab-GD-00202'));

    expect(screen.getByTestId('zending-bekijken-bestelling-header-1')).toHaveClass('hidden');
    expect(screen.getByTestId('zending-bekijken-bestelling-header-2')).not.toHaveClass('hidden');
  });

  it('does not show tabs for a single-order zending', () => {
    renderModal();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('skips a bestelnummer from the zending that has no matching bestelling', () => {
    renderModal({
      zending: { ...ZENDING, bestellingIds: ['GD-00201', 'GD-ONBEKEND'] },
      bestellingen: [BESTELLING_1],
    });
    expect(screen.getByTestId('zending-bekijken-bestelling-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('zending-bekijken-modal-leeg')).not.toBeInTheDocument();
  });

  it('shows a fallback message when none of the bestelnummers match a known bestelling', () => {
    renderModal({ bestellingen: [] });
    expect(screen.getByTestId('zending-bekijken-modal-leeg')).toHaveTextContent(
      'Geen bestelgegevens gevonden voor deze zending.'
    );
  });

  it('renders no edit or status controls — view only', () => {
    renderModal();
    // The only buttons are Modal's own built-in close controls (top-right × and footer "Sluiten").
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
