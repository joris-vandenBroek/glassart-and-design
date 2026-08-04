import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerShell } from '@/components/beheer/BeheerShell';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: vi.fn(),
  actorFromMedewerker: (user: { uid: string; email: string | null } | null) =>
    user
      ? { id: user.uid, email: user.email ?? 'Onbekend', naam: user.email ?? 'Onbekend' }
      : { id: null, email: 'Onbekend', naam: 'Onbekend' },
}));

const KLANT_DATA = {
  companyName: 'Testbedrijf BV',
  kvk: '12345678',
  contactPerson: 'Jan Jansen',
  email: 'jan@example.com',
  phone: '0612345678',
  contactPreference: 'email',
  address: 'Teststraat 1',
  postcode: '1234 AB',
  city: 'Teststad',
  deliveryAddress: '',
  deliveryPostcode: '',
  deliveryCity: '',
  invoiceAddress: '',
  invoicePostcode: '',
  invoiceCity: '',
  status: 'Beoordelen',
  prijsgroepId: null,
  kunstenaarId: null,
  minimaleAfname: null,
};

// Non-empty by default so the auto-seed path never triggers in these
// wiring tests — seeding itself is covered by the collection-specific
// data tests and useApiCollection.test.tsx.
const DEFAULT_COLLECTIONS: Record<string, unknown[]> = {
  klanten: [],
  bestelheaders: [],
  activiteitenlog: [],
  materiaalsoorten: [{ id: 'soort-1', omschrijving: 'Veiligheidsglas' }],
  materialen: [{ id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Test' }],
  maten: [{ id: 'maat-1', breedte: 40, hoogte: 60 }],
  segmenten: [{ id: 'seg-1', omschrijving: 'Hotel' }],
  stijlen: [],
  onderwerpen: [],
  prijsgroepen: [],
  drukkers: [],
  kunstwerken: [
    {
      id: 'kw-1',
      foto: 'https://storage.example.com/kw-1.jpg',
      segmentIds: ['seg-1'],
      materiaalIds: ['mat-1'],
      maatIds: ['maat-1'],
      omschrijvingNl: 'Hotel paneel 1',
      omschrijvingFr: '',
      omschrijvingDe: '',
      omschrijvingEn: '',
    },
  ],
  kunstenaars: [],
};

const BEDRIJFSGEGEVENS_FIXTURE = {
  bezoekadres: 'Den Heuvel 21, 5688 EM Oirschot',
  email: 'info@glassartdesign.nl',
  whatsappNummer: '31600000000',
  iban: 'NL00 BANK 0123 4567 89',
  kvkNummer: '12345678',
  btwNummer: 'NL123456789B01',
  openingstijden: { nl: 'Ma–vr: 09:00 – 17:00', en: '', fr: '', de: '' },
  contactpersonen: [
    { id: 'p1', naam: 'Paul van den Hout', telefoon: '+31651404089', rol: { nl: 'Voor projecten, hotels etc.', en: '', fr: '', de: '' } },
  ],
};

const BESTELINSTELLINGEN_FIXTURE = { minimaleAfname: 1 };
const BTWTARIEVEN_FIXTURE = { tarieven: [{ land: 'NL', percentage: 21 }], standaardPercentage: 21 };

let collections: Record<string, unknown[]> = {};
let klantenLoadFails = false;
let kunstwerkenLoadFails = false;

function mockCollections(overrides: Record<string, unknown[]> = {}) {
  collections = { ...DEFAULT_COLLECTIONS, ...overrides };
  klantenLoadFails = false;
  kunstwerkenLoadFails = false;
}

function resourceFromUrl(url: string): { resource: string; id?: string } {
  const path = url.replace(/^\/api\//, '');
  const segments = path.split('/');
  return { resource: segments[0], id: segments[1] };
}

beforeEach(() => {
  fetchMock.mockReset();
  mockCollections();
  fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const { resource, id } = resourceFromUrl(url);
    const method = init?.method ?? 'GET';

    if (resource === 'klanten' && !id && method === 'GET') {
      if (klantenLoadFails) return { ok: false };
      return { ok: true, json: async () => collections.klanten };
    }
    if (resource === 'kunstwerken' && !id && method === 'GET') {
      if (kunstwerkenLoadFails) return { ok: false };
      return { ok: true, json: async () => collections.kunstwerken };
    }
    if (resource === 'instellingen' && id === 'bedrijfsgegevens') {
      return { ok: true, json: async () => BEDRIJFSGEGEVENS_FIXTURE };
    }
    if (resource === 'instellingen' && id === 'bestelinstellingen') {
      return { ok: true, json: async () => BESTELINSTELLINGEN_FIXTURE };
    }
    if (resource === 'instellingen' && id === 'btwtarieven') {
      return { ok: true, json: async () => BTWTARIEVEN_FIXTURE };
    }
    if (method === 'GET' && !id) {
      return { ok: true, json: async () => collections[resource] ?? [] };
    }
    if (method === 'PATCH' || method === 'POST' || method === 'DELETE') {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => [] };
  });
});

function renderShell() {
  const onLogout = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BeheerShell email="paul@glassartanddesign.com" onLogout={onLogout} />
    </NextIntlClientProvider>
  );
  return { onLogout };
}

describe('BeheerShell', () => {
  it('shows the logged-in email and defaults to the Klanten section', async () => {
    mockCollections({ klanten: [{ id: 'uid-1', ...KLANT_DATA }] });
    renderShell();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent('paul@glassartanddesign.com');
    expect(await screen.findByTestId('klanten-section')).toBeInTheDocument();
  });

  it('calls onLogout when the nav logout button is clicked', async () => {
    const { onLogout } = renderShell();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    screen.getByTestId('beheer-nav-logout').click();
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows the total number of klanten on the Klanten nav item, regardless of status', async () => {
    mockCollections({
      klanten: [
        { id: 'uid-1', ...KLANT_DATA },
        { id: 'uid-2', ...KLANT_DATA, status: 'Goedgekeurd' },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('2'));
  });

  it('shows a load error on the Klanten section when the klanten fetch fails', async () => {
    mockCollections();
    klantenLoadFails = true;
    renderShell();
    expect(await screen.findByTestId('klanten-error')).toHaveTextContent(
      'Kon de klanten niet laden. Probeer de pagina te verversen.'
    );
  });

  it('opens a klant via the Klanten section, links a kunstenaar via the combobox, and PATCHes /api/klanten/{id}', async () => {
    mockCollections({
      klanten: [{ id: 'uid-1', ...KLANT_DATA }],
      kunstenaars: [
        { id: 'ka-1', naam: 'Sabrina Glasser', foto: null, omschrijvingNl: 'Werkt met glas.', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '', exclusieveKlantIds: [] },
      ],
    });
    renderShell();
    screen.getByTestId('beheer-nav-klanten').click();
    expect(await screen.findByTestId('klanten-section')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('data-table-row-uid-1'));
    expect(await screen.findByTestId('klant-modal')).toBeInTheDocument();

    fireEvent.focus(screen.getByTestId('klant-modal-kunstenaar'));
    fireEvent.click(screen.getByTestId('klant-modal-kunstenaar-option-ka-1'));
    fireEvent.click(screen.getByTestId('klant-modal-opslaan'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/klanten/uid-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ kunstenaarId: 'ka-1' }),
        })
      )
    );
  });

  it('shows the materiaalsoorten count and switches to the Materiaalsoorten section', async () => {
    mockCollections({
      materiaalsoorten: [
        { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
        { id: 'soort-2', omschrijving: 'Dibond' },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-materiaalsoorten').click();
    expect(await screen.findByTestId('materiaalsoorten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-soort-1')).toHaveTextContent('Veiligheidsglas');
  });

  it('opens the Stamgegevens nav group when switching to a grouped section like Materiaalsoorten', async () => {
    mockCollections({
      materiaalsoorten: [
        { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
        { id: 'soort-2', omschrijving: 'Dibond' },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('2'));
    expect(screen.getByTestId('beheer-nav-group-stamgegevens-items')).not.toBeVisible();

    screen.getByTestId('beheer-nav-materiaalsoorten').click();
    expect(await screen.findByTestId('materiaalsoorten-section')).toBeInTheDocument();
    expect(screen.getByTestId('beheer-nav-group-stamgegevens-items')).toBeVisible();
  });

  it('shows the materiaalsoort name in Materialen and the materialen count in the nav', async () => {
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-materialen').click();
    expect(await screen.findByTestId('materialen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('Veiligheidsglas');
  });

  it('shows the maten count and switches to the Maten section', async () => {
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-maten').click();
    expect(await screen.findByTestId('maten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-maat-1')).toHaveTextContent('40');
  });

  it('shows the total number of bestellingen on the nav item, regardless of status, and switches to the Bestellingen section', async () => {
    mockCollections({
      klanten: [{ id: 'uid-1', ...KLANT_DATA }],
      bestelheaders: [
        {
          id: 'header-1',
          klantId: 'uid-1',
          bestelnr: 'GD-00001',
          besteldatum: '2026-07-01T00:00:00',
          status: 'Te beoordelen',
          lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 }],
        },
        {
          id: 'header-2',
          klantId: 'uid-1',
          bestelnr: 'GD-00002',
          besteldatum: '2026-07-02T00:00:00',
          status: 'Afgewezen',
          lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
        },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-bestellingen').click();
    expect(await screen.findByTestId('bestellingen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-1')).toHaveTextContent('Testbedrijf BV');
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Hotel paneel');
  });

  it('shows the segmenten count and switches to the Segmenten section', async () => {
    mockCollections({
      segmenten: [
        { id: 'seg-1', omschrijving: 'Hotel' },
        { id: 'seg-2', omschrijving: 'Restaurant' },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-segmenten').click();
    expect(await screen.findByTestId('segmenten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-seg-1')).toHaveTextContent('Hotel');
  });

  it('shows the kunstwerken count and switches to the Kunstwerken section with segment names resolved', async () => {
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-kunstwerken').click();
    expect(await screen.findByTestId('kunstwerken-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-kw-1')).toHaveTextContent('Hotel');
  });

  it('shows a load error on the Kunstwerken section when the kunstwerken fetch fails', async () => {
    mockCollections();
    kunstwerkenLoadFails = true;
    renderShell();
    screen.getByTestId('beheer-nav-kunstwerken').click();
    expect(await screen.findByTestId('kunstwerken-error')).toHaveTextContent(
      'Kon de kunstwerken niet laden. Probeer de pagina te verversen.'
    );
  });

  it('shows the Activiteit section with the loaded count on its nav item', async () => {
    mockCollections({
      activiteitenlog: [
        {
          id: 'log-1',
          type: 'kunstwerk_bekeken',
          actorEmail: 'klant@example.com',
          actorNaam: 'Testbedrijf BV',
          omschrijving: 'Hotel paneel',
          timestamp: '2026-07-22T10:00:00',
        },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('beheer-nav-activiteit'));
    expect(await screen.findByTestId('activiteit-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Kunstwerk bekeken');
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Hotel paneel');
  });

  it('shows the prijsgroepen count and switches to the Prijsgroepen section', async () => {
    mockCollections({
      prijsgroepen: [
        { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0, opslagpercentage: null },
        { id: 'pg-2', naam: 'Wholesale', kortingspercentage: 15, opslagpercentage: null },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-prijsgroepen')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-prijsgroepen').click();
    expect(await screen.findByTestId('prijsgroepen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-pg-1')).toHaveTextContent('Standaard');
  });

  it('shows the count and switches to the Kunstenaars section', async () => {
    mockCollections({
      kunstenaars: [
        { id: 'ka-1', naam: 'Sabrina Glasser', foto: null, omschrijvingNl: 'Werkt met glas.', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '', exclusieveKlantIds: [] },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-kunstenaars')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-kunstenaars').click();
    expect(await screen.findByTestId('kunstenaars-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-ka-1')).toHaveTextContent('Sabrina Glasser');
  });

  it('shows the drukkers count and switches to the Drukkers section', async () => {
    mockCollections({
      drukkers: [
        { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl' },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-drukkers')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-drukkers').click();
    expect(await screen.findByTestId('drukkers-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-drukker-1')).toHaveTextContent('Drukkerij Janssen');
  });

  it('shows the Glassart & Design section with the loaded bedrijfsgegevens when the nav item is clicked', async () => {
    renderShell();
    screen.getByTestId('beheer-nav-glassartDesign').click();
    expect(await screen.findByTestId('glassart-design-section')).toBeInTheDocument();
    expect(screen.getByTestId('glassart-design-bezoekadres')).toHaveValue('Den Heuvel 21, 5688 EM Oirschot');
  });

  it('saves bedrijfsgegevens through the API and logs bedrijfsgegevens_gewijzigd', async () => {
    renderShell();
    screen.getByTestId('beheer-nav-glassartDesign').click();
    await screen.findByTestId('glassart-design-section');
    fireEvent.change(screen.getByTestId('glassart-design-email'), {
      target: { value: 'nieuw@glassartdesign.nl' },
    });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/instellingen/bedrijfsgegevens',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('nieuw@glassartdesign.nl'),
        })
      )
    );
  });

  it('shows the Instellingen section when selected', async () => {
    renderShell();
    fireEvent.click(screen.getByTestId('beheer-nav-instellingen'));
    expect(await screen.findByTestId('instellingen-section')).toBeInTheDocument();
  });
});
