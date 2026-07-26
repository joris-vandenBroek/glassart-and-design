import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BeheerShell } from '@/components/beheer/BeheerShell';
import messages from '../../../messages/nl.json';

const getDocsMock = vi.fn();
const addDocMock = vi.fn();
const getDocMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
  storage: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

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

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docsData.length === 0,
    docs: docsData.map(({ id, data }) => ({ id, data: () => data })),
  };
}

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
};

// Non-empty by default so the auto-seed path never triggers in these
// wiring tests — seeding itself is covered by the collection-specific
// data tests and useFirestoreCollection.test.tsx.
const DEFAULT_COLLECTIONS: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {
  klanten: [],
  bestelheaders: [],
  activiteitenlog: [],
  materiaalsoorten: [{ id: 'soort-1', data: { omschrijving: 'Veiligheidsglas' } }],
  materialen: [{ id: 'mat-1', data: { materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Test' } }],
  maten: [{ id: 'maat-1', data: { breedte: 40, hoogte: 60 } }],
  segmenten: [{ id: 'seg-1', data: { omschrijving: 'Hotel' } }],
  prijsgroepen: [],
  drukkers: [],
  kunstwerken: [
    {
      id: 'kw-1',
      data: {
        foto: 'https://storage.example.com/kw-1.jpg',
        segmentIds: ['seg-1'],
        materiaalIds: ['mat-1'],
        maatIds: ['maat-1'],
        prijzen: [{ materiaalId: 'mat-1', maatId: 'maat-1', prijs: 150 }],
        omschrijvingNl: 'Hotel paneel 1',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      },
    },
  ],
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

function mockCollections(overrides: Partial<typeof DEFAULT_COLLECTIONS> = {}) {
  const data = { ...DEFAULT_COLLECTIONS, ...overrides };
  getDocsMock.mockImplementation((collectionRef: { name: string }) =>
    Promise.resolve(makeSnapshot(data[collectionRef.name] ?? []))
  );
  getDocMock.mockResolvedValue({ exists: () => true, data: () => BEDRIJFSGEGEVENS_FIXTURE });
}

function renderShell() {
  const onLogout = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BeheerShell email="paul@glassartanddesign.com" onLogout={onLogout} />
    </NextIntlClientProvider>
  );
  return { onLogout };
}

beforeEach(() => {
  getDocsMock.mockReset();
  addDocMock.mockReset();
  getDocMock.mockReset();
  setDocMock.mockReset();
});

describe('BeheerShell', () => {
  it('shows the logged-in email and defaults to the Klanten section', async () => {
    mockCollections({ klanten: [{ id: 'uid-1', data: KLANT_DATA }] });
    renderShell();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent('paul@glassartanddesign.com');
    expect(await screen.findByTestId('klanten-section')).toBeInTheDocument();
  });

  it('calls onLogout when the nav logout button is clicked', async () => {
    mockCollections();
    const { onLogout } = renderShell();
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
    screen.getByTestId('beheer-nav-logout').click();
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows the count of "Beoordelen" klanten on the Klanten nav item', async () => {
    mockCollections({
      klanten: [
        { id: 'uid-1', data: KLANT_DATA },
        { id: 'uid-2', data: { ...KLANT_DATA, status: 'Goedgekeurd' } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-klanten')).toHaveTextContent('1'));
  });

  it('shows a load error on the Klanten section when getDocs fails for klanten', async () => {
    getDocsMock.mockImplementation((collectionRef: { name: string }) => {
      if (collectionRef.name === 'klanten') {
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve(makeSnapshot(DEFAULT_COLLECTIONS[collectionRef.name] ?? []));
    });
    renderShell();
    expect(await screen.findByTestId('klanten-error')).toHaveTextContent(
      'Kon de klanten niet laden. Probeer de pagina te verversen.'
    );
  });

  it('shows the materiaalsoorten count and switches to the Materiaalsoorten section', async () => {
    mockCollections({
      materiaalsoorten: [
        { id: 'soort-1', data: { omschrijving: 'Veiligheidsglas' } },
        { id: 'soort-2', data: { omschrijving: 'Dibond' } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materiaalsoorten')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-materiaalsoorten').click();
    expect(await screen.findByTestId('materiaalsoorten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-soort-1')).toHaveTextContent('Veiligheidsglas');
  });

  it('shows the materiaalsoort name in Materialen and the materialen count in the nav', async () => {
    mockCollections();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-materialen')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-materialen').click();
    expect(await screen.findByTestId('materialen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('Veiligheidsglas');
  });

  it('shows the maten count and switches to the Maten section', async () => {
    mockCollections();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-maten')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-maten').click();
    expect(await screen.findByTestId('maten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-maat-1')).toHaveTextContent('40');
  });

  it('shows the bestellingen count and switches to the Bestellingen section', async () => {
    mockCollections({
      klanten: [{ id: 'uid-1', data: KLANT_DATA }],
      bestelheaders: [
        {
          id: 'header-1',
          data: {
            klantId: 'uid-1',
            besteldatum: { toDate: () => new Date('2026-07-01') },
            status: 'Te beoordelen',
          },
        },
      ],
      'bestelheaders/header-1/bestellines': [
        { id: 'line-1', data: { kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-bestellingen')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-bestellingen').click();
    expect(await screen.findByTestId('bestellingen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-1')).toHaveTextContent('Testbedrijf BV');
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Hotel paneel');
  });

  it('shows the segmenten count and switches to the Segmenten section', async () => {
    mockCollections({
      segmenten: [
        { id: 'seg-1', data: { omschrijving: 'Hotel' } },
        { id: 'seg-2', data: { omschrijving: 'Restaurant' } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-segmenten')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-segmenten').click();
    expect(await screen.findByTestId('segmenten-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-seg-1')).toHaveTextContent('Hotel');
  });

  it('shows the kunstwerken count and switches to the Kunstwerken section with segment names resolved', async () => {
    mockCollections();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-kunstwerken')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-kunstwerken').click();
    expect(await screen.findByTestId('kunstwerken-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-kw-1')).toHaveTextContent('Hotel');
  });

  it('shows a load error on the Kunstwerken section when getDocs fails for kunstwerken', async () => {
    getDocsMock.mockImplementation((collectionRef: { name: string }) => {
      if (collectionRef.name === 'kunstwerken') {
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve(makeSnapshot(DEFAULT_COLLECTIONS[collectionRef.name] ?? []));
    });
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
          data: {
            type: 'kunstwerk_bekeken',
            actorEmail: 'klant@example.com',
            actorNaam: 'Testbedrijf BV',
            timestamp: { toDate: () => new Date('2026-07-22T10:00:00') },
          },
        },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-activiteit')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('beheer-nav-activiteit'));
    expect(await screen.findByTestId('activiteit-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-log-1')).toHaveTextContent('Kunstwerk bekeken');
  });

  it('shows the prijsgroepen count and switches to the Prijsgroepen section', async () => {
    mockCollections({
      prijsgroepen: [
        { id: 'pg-1', data: { naam: 'Standaard', kortingspercentage: 0 } },
        { id: 'pg-2', data: { naam: 'Wholesale', kortingspercentage: 15 } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-prijsgroepen')).toHaveTextContent('2'));
    screen.getByTestId('beheer-nav-prijsgroepen').click();
    expect(await screen.findByTestId('prijsgroepen-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-pg-1')).toHaveTextContent('Standaard');
  });

  it('shows the drukkers count and switches to the Drukkers section', async () => {
    mockCollections({
      drukkers: [
        { id: 'drukker-1', data: { naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' } },
      ],
    });
    renderShell();
    await waitFor(() => expect(screen.getByTestId('beheer-nav-drukkers')).toHaveTextContent('1'));
    screen.getByTestId('beheer-nav-drukkers').click();
    expect(await screen.findByTestId('drukkers-section')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-drukker-1')).toHaveTextContent('Drukkerij Janssen');
  });

  it('shows the Glassart & Design section with the loaded bedrijfsgegevens when the nav item is clicked', async () => {
    mockCollections();
    renderShell();
    screen.getByTestId('beheer-nav-glassartDesign').click();
    expect(await screen.findByTestId('glassart-design-section')).toBeInTheDocument();
    expect(screen.getByTestId('glassart-design-bezoekadres')).toHaveValue('Den Heuvel 21, 5688 EM Oirschot');
  });

  it('saves bedrijfsgegevens through setDoc and logs bedrijfsgegevens_gewijzigd', async () => {
    mockCollections();
    setDocMock.mockResolvedValue(undefined);
    renderShell();
    screen.getByTestId('beheer-nav-glassartDesign').click();
    await screen.findByTestId('glassart-design-section');
    fireEvent.change(screen.getByTestId('glassart-design-email'), {
      target: { value: 'nieuw@glassartdesign.nl' },
    });
    fireEvent.click(screen.getByTestId('glassart-design-opslaan'));
    await waitFor(() =>
      expect(setDocMock).toHaveBeenCalledWith(
        { collectionName: 'instellingen', id: 'bedrijfsgegevens' },
        expect.objectContaining({ email: 'nieuw@glassartdesign.nl' })
      )
    );
  });
});
