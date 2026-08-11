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
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),}));

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
];
const BTWTARIEVEN: BtwTarieven = { tarieven: [{ land: 'NL', percentage: 21 }] };

const BESTELLING: Bestelling = {
  id: 'header-1',
  klantnr: 'KN-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00101',
  korting: null,
  besteldatum: '1-7-2026',
  status: 'Te beoordelen',
  lineCount: 2,
  totalQuantity: 5,
  lines: [
    { id: 'line-1', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 },
    { id: 'line-2', code: 'onbekende-code', maatId: null, materiaalId: null, prijs: 0, quantity: 2 },
  ],
};

function renderModal(
  bestelling: Bestelling | null,
  overrides: Partial<React.ComponentProps<typeof BestellingModal>> = {}
) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onAfronden = vi.fn();
  const onBestellingGewijzigd = vi.fn();
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
        onAfronden={onAfronden}
        onBestellingGewijzigd={onBestellingGewijzigd}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, onAfronden, onBestellingGewijzigd };
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
  it('shows the bestelnummer in the subtitle', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('modal-header')).toHaveTextContent('GD-00101');
  });

  it('shows the zendingnummer in the subtitle when present', () => {
    renderModal({ ...BESTELLING, zendingnummer: 'ZD-00007' });
    expect(screen.getByTestId('modal-header')).toHaveTextContent('ZD-00007');
  });

  it('does not show a zendingnummer line when absent', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('modal-header')).not.toHaveTextContent('ZD-');
  });

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

  it('falls back to the "onbekend" label for a line whose code does not match any known kunstwerk', () => {
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

  it('opens the afwijzen confirmation without patching immediately', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    expect(screen.getByTestId('bestelling-modal-afwijzen-bevestiging')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/bestelheaders/header-1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('disables the afwijzen confirm button until a reason is entered', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    expect(screen.getByTestId('bestelling-modal-afwijzen-bevestigen')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Klant heeft geannuleerd' },
    });
    expect(screen.getByTestId('bestelling-modal-afwijzen-bevestigen')).not.toBeDisabled();
  });

  it('rejects the bestelling with the given reason and calls onUpdated with afwijsreden', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Klant heeft geannuleerd' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'Afgewezen', afwijsreden: 'Klant heeft geannuleerd' }),
        })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...BESTELLING,
        status: 'Afgewezen',
        afwijsreden: 'Klant heeft geannuleerd',
      })
    );
  });

  it('cancels the afwijzen confirmation without patching, and returns to the normal view', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Wordt niet verstuurd' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-annuleren'));
    expect(screen.queryByTestId('bestelling-modal-afwijzen-bevestiging')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/bestelheaders/header-1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('shows the stored afwijsreden when the bestelling is Afgewezen', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ ...BESTELLING, status: 'Afgewezen', afwijsreden: 'Klant heeft geannuleerd' });
    expect(screen.getByTestId('bestelling-modal-afwijsreden')).toHaveTextContent('Klant heeft geannuleerd');
  });

  it('does not show an afwijsreden block for a bestelling that is not Afgewezen', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-afwijsreden')).not.toBeInTheDocument();
  });

  it('shows an error and does not call onUpdated when the update request fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/statushistorie') || !String(url).includes('/bestelheaders/header-1')
        ? { ok: true, json: async () => [] }
        : Promise.reject(new Error('offline'))
    );
    const { onUpdated } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));

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
        'GD-00101'
      )
    );
  });

  it('logs bestelling_afgewezen with the reason included', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Klant heeft geannuleerd' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'bestelling_afgewezen',
        'GD-00101: Klant heeft geannuleerd'
      )
    );
  });

  it('does not log when the update request fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/statushistorie') || !String(url).includes('/bestelheaders/header-1')
        ? { ok: true, json: async () => [] }
        : Promise.reject(new Error('offline'))
    );
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen'));
    fireEvent.change(screen.getByTestId('bestelling-modal-afwijzen-bevestiging-reden'), {
      target: { value: 'Reden' },
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-afwijzen-bevestigen'));
    await screen.findByTestId('bestelling-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});

const BESTELLING_MET_EIGEN_MAAT: Bestelling = {
  id: 'header-2',
  klantnr: 'KN-2',
  companyName: 'Ander Bedrijf',
  bestelnr: 'GD-00102',
  korting: null,
  besteldatum: '3-7-2026',
  status: 'Te beoordelen',
  lineCount: 1,
  totalQuantity: 1,
  lines: [
    { id: 'line-3', code: 'Hotel paneel', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 },
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

  it('keeps the "Prijs vaststellen" button disabled until a positive number is entered', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '0' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).toBeDisabled();
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    expect(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3')).not.toBeDisabled();
  });

  it('drafts a price via "Prijs vaststellen" without patching immediately, shows it as pending, and saves it on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING_MET_EIGEN_MAAT);
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3'));

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/wijzigen'),
      expect.anything()
    );
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING_MET_EIGEN_MAAT.lines[0], prijs: 275 }], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-2/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ korting: null, updates: [{ id: 'line-3', prijs: 275 }], additions: [], deletions: [] }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({
        ...BESTELLING_MET_EIGEN_MAAT,
        lines: [{ ...BESTELLING_MET_EIGEN_MAAT.lines[0], prijs: 275 }],
        korting: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_gewijzigd', 'GD-00102');
  });

  it('does not disable Goedkeuren when every line already has a price', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-goedkeuren')).not.toBeDisabled();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren-blocked')).not.toBeInTheDocument();
  });
});

describe('BestellingModal — regel bewerken', () => {
  it('keeps line fields read-only until Bewerken is clicked, and hides Bewerken for an unresolved kunstwerk', () => {
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-regel-bewerken-line-1')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-regel-bewerken-line-2')).not.toBeInTheDocument();
  });

  it('drafts materiaal/maat/prijs/aantal edits without patching immediately, then saves them all on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-prijs-line-1'), { target: { value: '180' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/wijzigen'), expect.anything());
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();

    const bijgewerkteRegel = { ...BESTELLING.lines[0], materiaalId: 'mat-1', prijs: 180, quantity: 5, maatId: 'maat-1' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [bijgewerkteRegel, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            korting: null,
            updates: [{ id: 'line-1', materiaalId: 'mat-1', prijs: 180, quantity: 5, maatId: 'maat-1' }],
            additions: [],
            deletions: [],
          }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({
        ...BESTELLING,
        lines: [bijgewerkteRegel, BESTELLING.lines[1]],
        korting: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('bestelling_gewijzigd', 'GD-00101');
  });

  it('discards edits when Annuleren is clicked, and does not show a Wijzigingen opslaan button', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-annuleren-line-1'));
    expect(screen.queryByTestId('bestelling-modal-regel-materiaal-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-line-line-1')).toHaveTextContent('3 × € 150,00');
    expect(screen.queryByTestId('bestelling-modal-wijzigingen-opslaan')).not.toBeInTheDocument();
  });

  it('shows breedte/hoogte inputs instead of a maat select for a custom-size line, and drafts them', () => {
    renderModal(BESTELLING_MET_EIGEN_MAAT);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-3'));
    expect(screen.queryByTestId('bestelling-modal-regel-maat-line-3')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-breedte-line-3'), { target: { value: '95' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-hoogte-line-3'), { target: { value: '145' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-prijs-line-3'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-3'));
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();
  });

  it('does not show Wijzigingen opslaan when nothing has been drafted', () => {
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-wijzigingen-opslaan')).not.toBeInTheDocument();
  });

  it('shows an error and keeps the draft when the save request fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/wijzigen') ? Promise.reject(new Error('offline')) : { ok: true, json: async () => [] }
    );
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    expect(await screen.findByTestId('bestelling-modal-error')).toBeInTheDocument();
    expect(onBestellingGewijzigd).not.toHaveBeenCalled();
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-mail-vraag')).not.toBeInTheDocument();
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

  it('shows the korting input pre-filled and subtracts it from the total when korting is set', () => {
    renderModal({ ...BESTELLING, korting: 50 });
    // line-1: 150 × 3 = 450, line-2: 0 × 2 = 0, korting 50 → 400
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('€ 400,00');
    expect(screen.getByTestId('bestelling-modal-korting-input')).toHaveValue(50);
  });

  it('shows no korting row when korting is null', () => {
    renderModal(BESTELLING);
    expect(screen.queryByTestId('bestelling-modal-korting')).not.toBeInTheDocument();
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
          onAfronden={vi.fn()}
          onBestellingGewijzigd={vi.fn()}
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
          onAfronden={vi.fn()}
          onBestellingGewijzigd={vi.fn()}
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
  klantnr: 'KN-1',
  companyName: 'Testbedrijf BV',
  bestelnr: 'GD-00104',
  korting: null,
  besteldatum: '4-7-2026',
  status: 'Verstuurd naar drukker',
  lineCount: 1,
  totalQuantity: 1,
  lines: [{ id: 'line-6', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
};

const BESTELLING_TE_FACTUREREN: Bestelling = {
  ...BESTELLING_VERSTUURD,
  id: 'header-5',
  bestelnr: 'GD-00105',
  status: 'Te factureren',
};

const BESTELLING_BETAALD_EN_AFGEROND: Bestelling = {
  ...BESTELLING_VERSTUURD,
  id: 'header-6',
  bestelnr: 'GD-00106',
  status: 'Betaald en afgerond',
};

const BESTELLING_TE_VERSTUREN: Bestelling = {
  ...BESTELLING_VERSTUURD,
  id: 'header-7',
  bestelnr: 'GD-00107',
  status: 'Te versturen naar drukker',
};

describe('BestellingModal — afronden/terugzetten', () => {
  it('shows only Afronden for a bestelling that is Verstuurd naar drukker', () => {
    renderModal(BESTELLING_VERSTUURD);
    expect(screen.getByTestId('bestelling-modal-afronden')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-terugzetten')).not.toBeInTheDocument();
  });

  it('shows only Terugzetten for a bestelling that is Betaald en afgerond', () => {
    renderModal(BESTELLING_BETAALD_EN_AFGEROND);
    expect(screen.getByTestId('bestelling-modal-terugzetten')).toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afronden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-factureren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-terugzetten-naar-verstuurd')).not.toBeInTheDocument();
  });

  it('shows Factureren and a second Terugzetten button for a bestelling that is Te factureren', () => {
    renderModal(BESTELLING_TE_FACTUREREN);
    expect(screen.getByTestId('bestelling-modal-factureren')).toHaveTextContent('Betaald en afgerond melden');
    expect(screen.getByTestId('bestelling-modal-terugzetten-naar-verstuurd')).toHaveTextContent('Terugzetten');
    expect(screen.queryByTestId('bestelling-modal-afronden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-afwijzen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-terugzetten')).not.toBeInTheDocument();
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

  it('delegates afronden to onAfronden instead of patching the bestelling itself', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onAfronden, onUpdated } = renderModal(BESTELLING_VERSTUURD);
    fireEvent.click(screen.getByTestId('bestelling-modal-afronden'));

    expect(onAfronden).toHaveBeenCalledWith(BESTELLING_VERSTUURD);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(logActiviteitMock).not.toHaveBeenCalledWith(
      'bestelling_afgerond',
      expect.anything(),
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/bestelheaders/header-4',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Te factureren' }) })
    );
  });

  it('disables the "Afronden" button while an afrondronde elders bezig is, so a click has no effect', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onAfronden } = renderModal(BESTELLING_VERSTUURD, { isAfrondBezig: true });
    const knop = screen.getByTestId('bestelling-modal-afronden');

    expect(knop).toBeDisabled();
    expect(knop.className).toMatch(/disabled:opacity-40/);

    fireEvent.click(knop);
    expect(onAfronden).not.toHaveBeenCalled();
  });

  it('leaves the "Afronden" button enabled when isAfrondBezig is not set', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING_VERSTUURD);
    expect(screen.getByTestId('bestelling-modal-afronden')).not.toBeDisabled();
  });

  it('calls onUpdated with the status reverted to Te factureren when terugzetten from Betaald en afgerond, logs bestelling_afronding_teruggezet', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING_BETAALD_EN_AFGEROND);
    fireEvent.click(screen.getByTestId('bestelling-modal-terugzetten'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-6',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Te factureren' }) })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING_BETAALD_EN_AFGEROND, status: 'Te factureren' })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afronding_teruggezet',
      'GD-00106'
    );
  });

  it('calls onUpdated with the status reverted to Verstuurd naar drukker when terugzetten from Te factureren, logs bestelling_afronding_teruggezet', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING_TE_FACTUREREN);
    fireEvent.click(screen.getByTestId('bestelling-modal-terugzetten-naar-verstuurd'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-5',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Verstuurd naar drukker' }) })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING_TE_FACTUREREN, status: 'Verstuurd naar drukker' })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_afronding_teruggezet',
      'GD-00105'
    );
  });

  it('marks the bestelling as Betaald en afgerond when clicking Factureren, logs bestelling_gefactureerd', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onUpdated } = renderModal(BESTELLING_TE_FACTUREREN);
    fireEvent.click(screen.getByTestId('bestelling-modal-factureren'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-5',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Betaald en afgerond' }) })
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...BESTELLING_TE_FACTUREREN, status: 'Betaald en afgerond' })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'bestelling_gefactureerd',
      'GD-00105'
    );
  });

  it('shows an error and does not call onUpdated when Factureren fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(BESTELLING_TE_FACTUREREN);
    fireEvent.click(screen.getByTestId('bestelling-modal-factureren'));

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
        { status: 'Te factureren', tijdstip: '2026-08-05T08:30:00.000Z' },
        { status: 'Betaald en afgerond', tijdstip: '2026-08-05T09:00:00.000Z' },
      ],
    });
    renderModal(BESTELLING_BETAALD_EN_AFGEROND);
    const historie = await screen.findByTestId('bestelling-modal-historie');
    expect(historie).toHaveTextContent('Te beoordelen');
    expect(historie).toHaveTextContent('Goedgekeurd');
    expect(historie).toHaveTextContent('Verstuurd naar drukker');
    expect(historie).toHaveTextContent('Te factureren');
    expect(historie).toHaveTextContent('Betaald en afgerond');
    expect(fetchMock).toHaveBeenCalledWith('/api/bestelheaders/header-6/statushistorie');
  });

  it('shows the same status twice if it was reached twice (Betaald en afgerond -> Terugzetten -> Betaald en afgerond again)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { status: 'Te beoordelen', tijdstip: '2026-07-04T08:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-05T08:00:00.000Z' },
        { status: 'Betaald en afgerond', tijdstip: '2026-07-06T08:00:00.000Z' },
        { status: 'Verstuurd naar drukker', tijdstip: '2026-07-07T08:00:00.000Z' },
        { status: 'Betaald en afgerond', tijdstip: '2026-08-05T09:00:00.000Z' },
      ],
    });
    renderModal(BESTELLING_BETAALD_EN_AFGEROND);
    const historie = await screen.findByTestId('bestelling-modal-historie');
    expect(within(historie).getAllByText('Betaald en afgerond')).toHaveLength(2);
    expect(within(historie).getAllByText('Verstuurd naar drukker')).toHaveLength(2);
  });
});

describe('BestellingModal — regel verwijderen en toevoegen', () => {
  it('shows regel-verwijderen and regel-toevoegen for a status where regelstructuur is still editable', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-regel-verwijderen-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-regel-toevoegen')).toBeInTheDocument();
  });

  it('hides regel-verwijderen and regel-toevoegen from Verstuurd naar drukker onward, and for Afgewezen', () => {
    renderModal(BESTELLING_VERSTUURD);
    expect(screen.queryByTestId('bestelling-modal-regel-verwijderen-line-6')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-regel-toevoegen')).not.toBeInTheDocument();

    renderModal(BESTELLING_TE_FACTUREREN);
    expect(screen.queryByTestId('bestelling-modal-regel-toevoegen')).not.toBeInTheDocument();

    renderModal({ ...BESTELLING, status: 'Afgewezen' });
    expect(screen.queryByTestId('bestelling-modal-regel-toevoegen')).not.toBeInTheDocument();
  });

  it('shows regel-toevoegen while Te versturen naar drukker (still before Verstuurd naar drukker)', () => {
    renderModal(BESTELLING_TE_VERSTUREN);
    expect(screen.getByTestId('bestelling-modal-regel-toevoegen')).toBeInTheDocument();
  });

  it('marks a line for deletion, shows it struck through with an undo, and saves the deletion on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-verwijderen-line-1'));
    expect(screen.getByTestId('bestelling-modal-regel-verwijderen-ongedaan-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ lines: [BESTELLING.lines[1]], korting: null }) });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ korting: null, updates: [], additions: [], deletions: ['line-1'] }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({ ...BESTELLING, lines: [BESTELLING.lines[1]], korting: null })
    );
  });

  it('undoes a pending deletion', () => {
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-verwijderen-line-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-verwijderen-ongedaan-line-1'));
    expect(screen.queryByTestId('bestelling-modal-regel-verwijderen-ongedaan-line-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-wijzigingen-opslaan')).not.toBeInTheDocument();
  });

  it('adds a new line via the kunstwerk picker and saves it on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    fireEvent.focus(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk'));
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk-option-kw-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-materiaal'), { target: { value: 'mat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-maat'), { target: { value: 'maat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-aantal'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen'));

    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    const nieuweRegel = { id: 'line-nieuw', code: 'Hotel paneel', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 210, quantity: 2 };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [...BESTELLING.lines, nieuweRegel], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            korting: null,
            updates: [],
            additions: [{ kunstwerkId: 'kw-1', materiaalId: 'mat-1', maatId: 'maat-1', quantity: 2 }],
            deletions: [],
          }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({
        ...BESTELLING,
        lines: [...BESTELLING.lines, nieuweRegel],
        korting: null,
      })
    );
  });

  it('shows a newly drafted line as a full card with photo/code/materiaal/maat, matching a saved line', () => {
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    fireEvent.focus(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk'));
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk-option-kw-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-materiaal'), { target: { value: 'mat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-maat'), { target: { value: 'maat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-aantal'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen'));

    const kaarten = screen.getAllByTestId(/^bestelling-modal-nieuwe-regel-kaart-/);
    expect(kaarten).toHaveLength(1);
    const kaart = kaarten[0];
    expect(kaart.querySelector('img')).toHaveAttribute('src', 'https://example.com/kw-1.jpg');
    expect(kaart).toHaveTextContent('Hotel paneel');
    expect(kaart).toHaveTextContent('40×60 cm');
    expect(kaart).toHaveTextContent('2 × prijs bekend na opslaan');
  });

  it('removes a drafted addition without saving when its Verwijderen link is clicked', () => {
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    fireEvent.focus(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk'));
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk-option-kw-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-materiaal'), { target: { value: 'mat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-maat'), { target: { value: 'maat-1' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen'));
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    const kaart = screen.getByTestId(/^bestelling-modal-nieuwe-regel-kaart-/);
    fireEvent.click(within(kaart).getByText('Verwijderen'));

    expect(screen.queryByTestId(/^bestelling-modal-nieuwe-regel-kaart-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('bestelling-modal-wijzigingen-opslaan')).not.toBeInTheDocument();
  });

  it('keeps "Regel toevoegen" opslaan disabled until kunstwerk/materiaal/maat and a whole positive aantal are all set', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    expect(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen')).toBeDisabled();

    fireEvent.focus(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk'));
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk-option-kw-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-materiaal'), { target: { value: 'mat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-maat'), { target: { value: 'maat-1' } });
    // aantal staat nog op de standaardwaarde '1' (geldig) -- de knop is dus al bruikbaar
    // vóórdat er iets aan aantal wordt gewijzigd; dat is het gedrag dat de volgende twee
    // wijzigingen (2.5, dan 2) verifiëren.
    expect(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen')).not.toBeDisabled();

    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-aantal'), { target: { value: '2.5' } });
    expect(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen')).toBeDisabled();

    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-aantal'), { target: { value: '2' } });
    expect(screen.getByTestId('bestelling-modal-nieuwe-regel-toevoegen-bevestigen')).not.toBeDisabled();
  });

  it('shows a live prijsvoorbeeld once kunstwerk/materiaal/maat are complete, calling the prijsvoorbeeld endpoint', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/prijsvoorbeeld')
        ? { ok: true, json: async () => ({ status: 'vast', code: 'Hotel paneel', prijs: 120 } as unknown) }
        : { ok: true, json: async () => [] }
    );
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    fireEvent.focus(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk'));
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk-option-kw-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-materiaal'), { target: { value: 'mat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-maat'), { target: { value: 'maat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-aantal'), { target: { value: '3' } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/prijsvoorbeeld?kunstwerkId=kw-1&materiaalId=mat-1&maatId=maat-1'
      )
    );
    expect(await screen.findByTestId('bestelling-modal-nieuwe-regel-prijsvoorbeeld')).toHaveTextContent(
      '3 × € 120,00 = € 360,00'
    );
  });

  it('shows "Prijs op aanvraag" in the prijsvoorbeeld when the combination has no fixed matrixprijs', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/prijsvoorbeeld')
        ? { ok: true, json: async () => ({ status: 'op-aanvraag', code: 'Hotel paneel' } as unknown) }
        : { ok: true, json: async () => [] }
    );
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    fireEvent.focus(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk'));
    fireEvent.click(screen.getByTestId('bestelling-modal-nieuwe-regel-kunstwerk-option-kw-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-materiaal'), { target: { value: 'mat-1' } });
    fireEvent.change(screen.getByTestId('bestelling-modal-nieuwe-regel-maat'), { target: { value: 'maat-1' } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/prijsvoorbeeld?kunstwerkId=kw-1&materiaalId=mat-1&maatId=maat-1'
      )
    );
    expect(await screen.findByTestId('bestelling-modal-nieuwe-regel-prijsvoorbeeld')).toHaveTextContent(
      'Prijs op aanvraag'
    );
  });

  it('shows no prijsvoorbeeld until kunstwerk/materiaal/maat are all chosen', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-toevoegen'));
    expect(screen.queryByTestId('bestelling-modal-nieuwe-regel-prijsvoorbeeld')).not.toBeInTheDocument();
  });
});

describe('BestellingModal — onbekend materiaal/maat op een bestaande regel', () => {
  it('shows "Onbekend" instead of a raw id when a line references a materiaal/maat that no longer resolves', () => {
    const BESTELLING_MET_STALE_IDS: Bestelling = {
      ...BESTELLING,
      lines: [
        {
          id: 'line-stale',
          code: 'Hotel paneel',
          maatId: 'oude-firestore-id-die-niet-meer-bestaat',
          materiaalId: 'nog-een-oude-firestore-id',
          prijs: 50,
          quantity: 1,
        },
      ],
    };
    renderModal(BESTELLING_MET_STALE_IDS);
    const line = screen.getByTestId('bestelling-modal-line-line-stale');
    expect(line).toHaveTextContent('Onbekend');
    expect(line).not.toHaveTextContent('oude-firestore-id-die-niet-meer-bestaat');
    expect(line).not.toHaveTextContent('nog-een-oude-firestore-id');
  });
});

describe('BestellingModal — wijzigingsmail', () => {
  it('shows the mail-confirmation dialog after a successful Wijzigingen opslaan, and not before', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    expect(screen.queryByTestId('bestelling-modal-mail-vraag')).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING.lines[0], quantity: 5 }, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    expect(await screen.findByTestId('bestelling-modal-mail-vraag')).toBeInTheDocument();
  });

  it('sends the wijzigingsmail and closes the dialog when Ja is clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING.lines[0], quantity: 5 }, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));
    await screen.findByTestId('bestelling-modal-mail-vraag');

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    fireEvent.click(screen.getByTestId('bestelling-modal-mail-ja'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/mail',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ soort: 'bestelwijziging', bestelheaderId: 'header-1' }),
        })
      )
    );
    await waitFor(() => expect(screen.queryByTestId('bestelling-modal-mail-vraag')).not.toBeInTheDocument());
  });

  it('closes the dialog without sending mail when Nee is clicked', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal(BESTELLING);
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-aantal-line-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lines: [{ ...BESTELLING.lines[0], quantity: 5 }, BESTELLING.lines[1]], korting: null }),
    });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));
    await screen.findByTestId('bestelling-modal-mail-vraag');

    fireEvent.click(screen.getByTestId('bestelling-modal-mail-nee'));

    expect(screen.queryByTestId('bestelling-modal-mail-vraag')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/mail', expect.anything());
  });
});

describe('BestellingModal — korting bewerken', () => {
  it('drafts a korting via the korting input and sends it as korting on Wijzigingen opslaan', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const { onBestellingGewijzigd } = renderModal(BESTELLING);
    fireEvent.change(screen.getByTestId('bestelling-modal-korting-input'), { target: { value: '30' } });
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ lines: BESTELLING.lines, korting: 30 }) });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ korting: 30, updates: [], additions: [], deletions: [] }),
        })
      )
    );
    await waitFor(() =>
      expect(onBestellingGewijzigd).toHaveBeenCalledWith({ ...BESTELLING, lines: BESTELLING.lines, korting: 30 })
    );
  });

  it('sends korting: null when a previously set korting is cleared and saved', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    renderModal({ ...BESTELLING, korting: 50 });
    fireEvent.change(screen.getByTestId('bestelling-modal-korting-input'), { target: { value: '' } });
    expect(screen.getByTestId('bestelling-modal-wijzigingen-opslaan')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ lines: BESTELLING.lines, korting: null }) });
    fireEvent.click(screen.getByTestId('bestelling-modal-wijzigingen-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bestelheaders/header-1/wijzigen',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ korting: null, updates: [], additions: [], deletions: [] }),
        })
      )
    );
  });

  it('hides the korting input when the bestelling is Afgewezen', () => {
    renderModal({ ...BESTELLING, status: 'Afgewezen' });
    expect(screen.queryByTestId('bestelling-modal-korting-input')).not.toBeInTheDocument();
  });

  it('keeps the korting input present and editable at Betaald en afgerond', () => {
    renderModal(BESTELLING_BETAALD_EN_AFGEROND);
    const input = screen.getByTestId('bestelling-modal-korting-input');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it('has min="0" on the korting input to discourage negative values', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-korting-input')).toHaveAttribute('min', '0');
  });
});

describe('BestellingModal — live totalen bij concept-wijzigingen', () => {
  it('updates the header total live when a line price is drafted, before Wijzigingen opslaan', () => {
    renderModal(BESTELLING);
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('€ 450,00');
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-bewerken-line-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-regel-prijs-line-1'), { target: { value: '200' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-regel-opslaan-line-1'));
    // line-1: 200 × 3 = 600, line-2: 0 × 2 = 0 -> total 600
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('€ 600,00');
  });

  it('updates the header total live when a korting value is drafted, before Wijzigingen opslaan', () => {
    renderModal(BESTELLING);
    fireEvent.change(screen.getByTestId('bestelling-modal-korting-input'), { target: { value: '50' } });
    // line-1: 450, korting 50 -> 400
    expect(screen.getByTestId('bestelling-modal-total')).toHaveTextContent('€ 400,00');
  });
});
