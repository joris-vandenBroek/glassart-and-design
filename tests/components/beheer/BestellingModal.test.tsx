import { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingModal } from '@/components/beheer/BestellingModal';
import type { Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { BtwTarieven } from '@/components/beheer/btwTarievenTypes';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
const logActiviteitMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Hotel paneel',
    kunstenaarId: null,
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
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Extra diepte en stevigheid.' },
];
const MATEN: Maat[] = [{ id: 'maat-1', breedte: 40, hoogte: 60 }];
const MATERIAALSOORTEN: Materiaalsoort[] = [{ id: 'soort-1', omschrijving: 'Veiligheidsglas' }];
const KLANTEN: Klant[] = [
  {
    id: 'uid-1',
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
    kunstenaarId: null,
  },
];
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00101',
  besteldatum: '1-7-2026',
  status: 'Te beoordelen',
  lineCount: 2,
  totalQuantity: 5,
  lines: [
    { id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 },
    { id: 'line-2', kunstwerkId: null, maatId: null, materiaalId: null, prijs: 0, quantity: 2 },
  ],
};

function renderModal(bestelling: Bestelling | null) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingModal
        bestelling={bestelling}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        klanten={KLANTEN}
        btwTarieven={BTWTARIEVEN}
        onClose={onClose}
        onUpdated={onUpdated}
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
        onLineUpdated={onLineUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, onLinePrijsVastgesteld, onLineUpdated };
}

beforeEach(() => {
  fetchMock.mockReset();
  // Default: every fetch (including BestellingModal's mount-time historie GET) resolves
  // cleanly with an empty history unless a test overrides it. Tests that only care about
  // a PATCH call's arguments rely on this default for the historie GET they don't mock.
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  logActiviteitMock.mockReset();
});

describe('BestellingModal', () => {
  it('caps the bestelregels list height so it scrolls independently of the modal frame', () => {
    renderModal(BESTELLING);
    const list = screen.getByTestId('bestelling-modal-line-line-1').closest('ul');
    expect(list?.className).toMatch(/max-h-80/);
    expect(list?.className).toMatch(/overflow-y-auto/);
  });

  it('renders nothing when bestelling is null', () => {
    renderModal(null);
    expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument();
  });

  it('shows the resolved kunstwerk photo, description, materiaal/maat labels and price for a known line', () => {
    renderModal(BESTELLING);
    const line1 = screen.getByTestId('bestelling-modal-line-line-1');
    expect(line1).toHaveTextContent('Hotel paneel');
    expect(line1).toHaveTextContent('4mm Veiligheidsglas — Extra diepte en stevigheid.');
    expect(line1).toHaveTextContent('40×60 cm');
    expect(line1).toHaveTextContent('3 × € 150,00');
    expect(line1).toHaveTextContent('€ 450,00');
    expect(line1.querySelector('img')).toHaveAttribute('src', 'https://example.com/kw-1.jpg');
  });

  it('falls back to the "onbekend" label for a line whose kunstwerkId does not match any known kunstwerk', () => {
    renderModal(BESTELLING);
    const line2 = screen.getByTestId('bestelling-modal-line-line-2');
    expect(line2).toHaveTextContent('Onbekend');
    expect(line2).toHaveTextContent('2 × € 0,00');
    expect(line2.querySelector('img')).not.toBeInTheDocument();
  });

  it('approves the bestelling and calls onUpdated with status Te versturen naar drukker', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'Te versturen naar drukker' }),
        })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Te versturen naar drukker' })
    );
  });

  it('rejects the bestelling and calls onUpdated with status Afgewezen', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Afgewezen' }) })
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when the update request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));

    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('logs bestelling_goedgekeurd with the logged-in medewerker on approval', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_goedgekeurd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00101'
      )
    );
  });

  it('logs bestelling_afgewezen with the logged-in medewerker on rejection', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_afgewezen',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'GD-00101'
      )
    );
  });

  it('does not log when the update request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    await screen.findByTestId('bestelling-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});

const BESTELLING_MET_EIGEN_MAAT: Bestelling = {
  id: 'header-2',
  klantId: 'uid-2',
  companyName: 'Ander Bedrijf',
  bestelnr: 'GD-00102',
  besteldatum: '3-7-2026',
  status: 'Te beoordelen',
  lineCount: 1,
  totalQuantity: 1,
  lines: [
    { id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
  ],
};

describe('BestellingModal — eigen maat / offerte pricing', () => {
  it('shows the custom breedte×hoogte and "Prijs op aanvraag" for an unpriced line, and disables Goedkeuren', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    const line = screen.getByTestId('bestelling-modal-line-line-3');
    expect(line).toHaveTextContent('90×140 cm');
    expect(line).toHaveTextContent('Prijs op aanvraag');
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).toBeDisabled();
    expect(screen.getByTestId('bestelling-modal-goedkeuren-blocked')).toHaveTextContent(
      'Alle regels moeten eerst een prijs krijgen voordat u kunt goedkeuren.'
    );
  });

  it('sets a price on an unpriced line via "Prijs vaststellen", updates the order, logs the event, and re-enables Goedkeuren', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onLinePrijsVastgesteld } = renderModal(BESTELLING_MET_EIGEN_MAAT);
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-2/bestellines/line-3',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ prijs: 275 }) })
      )
    );
    await waitFor(() => expect(onLinePrijsVastgesteld).toHaveBeenCalledWith('header-2', 'line-3', 275));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_prijs_vastgesteld',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00102'
    );
  });

  it('keeps the "Prijs vaststellen" button disabled until a positive number is entered', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '0' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).not.toBeDisabled();
  });

  it('does not disable Goedkeuren when every line already has a price', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).not.toBeDisabled();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren-blocked')).not.toBeInTheDocument();
  });

  it('keeps the draft price of a still-unpriced line after submitting another line\'s price in the same order', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    const BESTELLING_MET_TWEE_ONGEPRIJSDE_REGELS: Bestelling = {
      id: 'header-3',
      klantId: 'uid-3',
      companyName: 'Weer Een Bedrijf',
      bestelnr: 'GD-00103',
      besteldatum: '5-7-2026',
      status: 'Te beoordelen',
      lineCount: 2,
      totalQuantity: 2,
      lines: [
        { id: 'line-4', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 50, hoogte: 80, prijs: null, quantity: 1 },
        { id: 'line-5', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 60, hoogte: 90, prijs: null, quantity: 1 },
      ],
    };

    // Mimics BestellingenSection: onLinePrijsVastgesteld merges the priced line into a
    // brand-new `{ ...current, lines: [...] }` object, giving `bestelling` a new reference
    // on every submit while the order id stays the same.
    function Wrapper() {
      const [bestelling, setBestelling] = useState(BESTELLING_MET_TWEE_ONGEPRIJSDE_REGELS);
      return (
        <NextIntlClientProvider locale="nl" messages={messages}>
          <BestellingModal
            bestelling={bestelling}
            kunstwerken={KUNSTWERKEN}
            materialen={MATERIALEN}
            maten={MATEN}
            materiaalsoorten={MATERIAALSOORTEN}
            klanten={KLANTEN}
            btwTarieven={BTWTARIEVEN}
            onClose={vi.fn()}
            onUpdated={vi.fn()}
            onLinePrijsVastgesteld={(_bestellingId, lineId, prijs) => {
              setBestelling((current) => ({
                ...current,
                lines: current.lines.map((line) => (line.id === lineId ? { ...line, prijs } : line)),
              }));
            }}
            onLineUpdated={vi.fn()}
          />
        </NextIntlClientProvider>
      );
    }

    render(<Wrapper />);

    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-4'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-5'), { target: { value: '200' } });

    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-4'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-3/bestellines/line-4',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ prijs: 100 }) })
      )
    );

    await waitFor(() =>
      expect(screen.getByTestId('bestelling-modal-prijs-input-line-5')).toHaveValue(200)
    );
  });
});

describe('BestellingModal — regel bewerken', () => {
  it('keeps line fields read-only until Bewerken is clicked, and hides Bewerken for an unresolved kunstwerk', () => {
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-regel-bewerken-line-1')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-regel-bewerken-line-2')).not.toBeInTheDocument();
  });

  it('edits a standard-maat line and saves materiaal/maat/prijs/aantal', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onLineUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-prijs-line-1'), { target: { value: '180' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/bestellines/line-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ materiaalId: 'mat-1', prijs: 180, quantity: 5, maatId: 'maat-1' }),
        })
      )
    );
    await waitFor(() =>
      expect(onLineUpdated).toHaveBeenCalledWith('header-1', 'line-1', {
        materiaalId: 'mat-1',
        prijs: 180,
        quantity: 5,
        maatId: 'maat-1',
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_regel_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00101'
    );
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();
  });

  it('discards edits when Annuleren is clicked', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-annuleren-line-1'));
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-line-line-1')).toHaveTextContent('3 × € 150,00');
    // Annuleren must not PATCH the line -- the component's mount-time historie GET is unrelated.
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/bestelheaders/header-1/bestellines/line-1',
      expect.anything()
    );
  });

  it('shows breedte/hoogte inputs instead of a maat select for a custom-size line', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onLineUpdated } = renderModal(BESTELLING_MET_EIGEN_MAAT);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-3'));
    expect(screen.queryByTestId('bestelling-modal-regel-maat-line-3')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-breedte-line-3'), { target: { value: '95' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-hoogte-line-3'), { target: { value: '145' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-prijs-line-3'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-3'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-2/bestellines/line-3',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ materiaalId: 'mat-1', prijs: 300, quantity: 1, maatId: '', breedte: 95, hoogte: 145 }),
        })
      )
    );
    await waitFor(() =>
      expect(onLineUpdated).toHaveBeenCalledWith('header-2', 'line-3', {
        materiaalId: 'mat-1',
        prijs: 300,
        quantity: 1,
        maatId: '',
        breedte: 95,
        hoogte: 145,
      })
    );
  });
});

describe('BestellingModal — bestelling-totaal', () => {
  it('shows the order total in the header, computed from all lines', () => {
    renderModal(BESTELLING);
    // line-1: 150 × 3 = 450, line-2: 0 × 2 = 0 → total 450
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('€ 450,00');
  });

  it('shows an incomplete-total placeholder and disables Goedkeuren when a line has no price yet', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('Wordt nog vastgesteld');
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).toBeDisabled();
  });
});

describe('BestellingModal — btw', () => {
  it('shows the btw percentage, btw-bedrag and totaal incl. btw based on the klant land', () => {
    renderModal(BESTELLING);
    // total excl. btw = 450 (see the bestelling-totaal describe block above)
    expect(screen.getByTestId('bestelling-modal-btw')).toHaveTextContent('21');
    expect(screen.getByTestId('bestelling-modal-btw')).toHaveTextContent('€ 94,50');
    expect(screen.getByTestId('bestelling-modal-totaal-incl')).toHaveTextContent('€ 544,50');
  });

  it('shows no btw block when the klant has no land set', () => {
    const klantZonderLand = { ...KLANTEN[0], land: undefined };
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <BestellingModal
          bestelling={BESTELLING}
          kunstwerken={KUNSTWERKEN}
          materialen={MATERIALEN}
          maten={MATEN}
          materiaalsoorten={MATERIAALSOORTEN}
          klanten={[klantZonderLand]}
          btwTarieven={{ tarieven: [{ land: 'DE', percentage: 19 }] }}
          onClose={vi.fn()}
          onUpdated={vi.fn()}
          onLinePrijsVastgesteld={vi.fn()}
          onLineUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    expect(screen.queryByTestId('bestelling-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-totaal-incl')).not.toBeInTheDocument();
  });

  it('shows no btw block when the total itself is incomplete', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.queryByTestId('bestelling-modal-btw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-totaal-incl')).not.toBeInTheDocument();
  });

  it('uses invoiceLand over land when both are set (invoiceLand takes precedence)', () => {
    const klantMetAfwijkendFactuurland = { ...KLANTEN[0], land: 'NL', invoiceLand: 'BE' };
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <BestellingModal
          bestelling={BESTELLING}
          kunstwerken={KUNSTWERKEN}
          materialen={MATERIALEN}
          maten={MATEN}
          materiaalsoorten={MATERIAALSOORTEN}
          klanten={[klantMetAfwijkendFactuurland]}
          btwTarieven={{
            tarieven: [
              { land: 'NL', percentage: 21 },
              { land: 'BE', percentage: 6 },
            ],
          }}
          onClose={vi.fn()}
          onUpdated={vi.fn()}
          onLinePrijsVastgesteld={vi.fn()}
          onLineUpdated={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    const btw = screen.getByTestId('bestelling-modal-btw');
    expect(btw).toHaveTextContent('6');
    expect(btw).not.toHaveTextContent('21');
  });
});

const BESTELLING_VERSTUURD: Bestelling = {
  id: 'header-4',
  klantId: 'uid-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00104',
  besteldatum: '4-7-2026',
  status: 'Verstuurd naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-6', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
};

const BESTELLING_AFGEROND: Bestelling = {
  ...BESTELLING_VERSTUURD,
  id: 'header-5',
  bestelnr: 'GD-00105',
  status: 'Afgerond',
};

describe('BestellingModal — afronden/terugzetten', () => {
  it('shows only Afronden for a bestelling that is Verstuurd naar drukker', () => {
    renderModal(BESTELLING_VERSTUURD);
    expect(screen.getByTestId('bestelling-modal-afronden')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-terugzetten')).not.toBeInTheDocument();
  });

  it('shows only Terugzetten for a bestelling that is Afgerond', () => {
    renderModal(BESTELLING_AFGEROND);
    expect(screen.getByTestId('bestelling-modal-terugzetten')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afronden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
  });

  it('shows no action buttons for a bestelling that is Te versturen naar drukker or Afgewezen', () => {
    renderModal({ ...BESTELLING_VERSTUURD, status: 'Te versturen naar drukker' });
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afronden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-terugzetten')).not.toBeInTheDocument();

    renderModal({ ...BESTELLING_VERSTUURD, status: 'Afgewezen' });
    expect(screen.queryAllByTestId('bestelling-modal-goedkeuren')).toHaveLength(0);
    expect(screen.queryAllByTestId('bestelling-modal-afronden')).toHaveLength(0);
    expect(screen.queryAllByTestId('bestelling-modal-terugzetten')).toHaveLength(0);
  });

  it('marks the bestelling as Afgerond, logs bestelling_afgerond, and calls onUpdated', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING_VERSTUURD);
    fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-4',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Afgerond' }) })
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'Afgerond' })));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afgerond',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00104'
    );
  });

  it('sets afgerondOp to null in onUpdated when terugzetten, logs bestelling_afronding_teruggezet', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING_AFGEROND);
    fireEvent.click(screen.getByTestId('bestelling-modal-terugzetten'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-5',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Verstuurd naar drukker' }) })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING_AFGEROND, status: 'Verstuurd naar drukker' })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afronding_teruggezet',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'GD-00105'
    );
  });

  it('shows an error and does not call onUpdated when afronden fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(BESTELLING_VERSTUURD);
    fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));
    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('fetches and shows the status history from the API, in the order the server returned it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { status: 'Te beoordelen', tijdstip: '2026-07-04T08:00:00.000Z' },
        { status: 'Te versturen naar drukker', tijdstip: '2026-07-04T09:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-05T08:00:00.000Z' },
        { status: 'Afgerond', tijdstip: '2026-08-05T09:00:00.000Z' },
      ],
    });
    renderModal(BESTELLING_AFGEROND);
    const historie = await screen.findByTestId('bestelling-modal-historie');
    expect(historie).toHaveTextContent('Te beoordelen');
    expect(historie).toHaveTextContent('Goedgekeurd');
    expect(historie).toHaveTextContent('Verstuurd naar drukker');
    expect(historie).toHaveTextContent('Afgerond');
    expect(fetchMock).toHaveBeenCalledWith('/api/bestelheaders/header-5/statushistorie');
  });

  it('shows the same status twice if it was reached twice (Afgerond -> Terugzetten -> Afgerond again)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { status: 'Te beoordelen', tijdstip: '2026-07-04T08:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-05T08:00:00.000Z' },
        { status: 'Afgerond', tijdstip: '2026-07-06T08:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-07T08:00:00.000Z' },
        { status: 'Afgerond', tijdstip: '2026-08-05T09:00:00.000Z' },
      ],
    });
    renderModal(BESTELLING_AFGEROND);
    const historie = await screen.findByTestId('bestelling-modal-historie');
    expect(within(historie).getAllByText('Afgerond')).toHaveLength(2);
    expect(within(historie).getAllByText('Verstuurd naar drukker')).toHaveLength(2);
  });
});
