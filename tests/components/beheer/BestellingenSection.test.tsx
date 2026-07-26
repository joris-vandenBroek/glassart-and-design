import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingenSection, type Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort, Drukker } from '@/components/beheer/materiaalTypes';
import type { Klant } from '@/components/beheer/KlantenSection';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();
const addDocMock = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...segments: string[]) => ({ collectionName: segments.slice(0, -1).join('/'), id: segments[segments.length - 1] })),
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  serverTimestamp: () => 'server-timestamp',
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

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Hotel paneel',
    artiest: '',
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
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Veiligheidsglas' },
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
    deliveryAddress: '',
    deliveryPostcode: '',
    deliveryCity: '',
    invoiceAddress: '',
    invoicePostcode: '',
    invoiceCity: '',
    status: 'Goedgekeurd',
    prijsgroepId: 'pg-1',
  },
];

const DRUKKERS: Drukker[] = [
  { id: 'drukker-1', naam: 'Drukkerij Janssen', adres: 'Perslaan 1', postcode: '1000 AA', plaats: 'Utrecht', email: 'info@janssen.nl', prijsafspraken: '' },
];

const BESTELLINGEN: Bestelling[] = [
  {
    id: 'header-1',
    klantId: 'uid-1',
    companyName: 'Testbedrijf BV',
    besteldatum: '1-7-2026',
    status: 'Te beoordelen',
    lineCount: 1,
    totalQuantity: 3,
    lines: [{ id: 'line-1', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 3 }],
  },
  {
    id: 'header-2',
    klantId: 'uid-2',
    companyName: 'Ander Bedrijf',
    besteldatum: '2-7-2026',
    status: 'Verstuurd naar drukker',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();

  function element(props: Partial<React.ComponentProps<typeof BestellingenSection>>) {
    return (
      <NextIntlClientProvider locale="nl" messages={messages}>
        <BestellingenSection
          bestellingen={BESTELLINGEN}
          kunstwerken={KUNSTWERKEN}
          materialen={MATERIALEN}
          maten={MATEN}
          materiaalsoorten={MATERIAALSOORTEN}
          klanten={KLANTEN}
          drukkers={DRUKKERS}
          loadError={null}
          onBestellingUpdated={onBestellingUpdated}
          onLinePrijsVastgesteld={onLinePrijsVastgesteld}
          onLineUpdated={onLineUpdated}
          {...props}
        />
      </NextIntlClientProvider>
    );
  }

  const { rerender: rtlRerender } = render(element(overrides));
  function rerender(bestellingen: Bestelling[]) {
    rtlRerender(element({ bestellingen }));
  }
  return { onBestellingUpdated, onLinePrijsVastgesteld, onLineUpdated, rerender };
}

beforeEach(() => {
  updateDocMock.mockReset();
  addDocMock.mockReset();
  fetchMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
  vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
});

describe('BestellingenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('bestellingen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while bestellingen is null and there is no error', () => {
    renderSection({ bestellingen: null });
    expect(screen.queryByTestId('bestellingen-section')).not.toBeInTheDocument();
  });

  it('shows all bestellingen by default (status filter defaults to "alle bestellingen")', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-2')).toBeInTheDocument();
  });

  it('shows only the "Te versturen naar drukker" bestelling after clicking that quick filter link', () => {
    const bestellingen = [
      { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
      BESTELLINGEN[1],
    ];
    renderSection({ bestellingen });
    fireEvent.click(screen.getByTestId('data-table-quick-active'));
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-header-2')).not.toBeInTheDocument();
  });

  it("opens the BestellingModal with the clicked bestelling's resolved kunstwerk data when a row is clicked", () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('bestelling-modal')).toHaveTextContent('Hotel paneel');
  });

  it('closes the modal and reports the updated bestelling via onBestellingUpdated after approving', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onBestellingUpdated } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.click(screen.getByTestId('bestelling-modal-goedkeuren'));

    await waitFor(() =>
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' })
    );
    await waitFor(() => expect(screen.queryByTestId('bestelling-modal')).not.toBeInTheDocument());
  });

  it('keeps the modal open and reflects the new price after "Prijs vaststellen", without closing it', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const bestellingenMetEigenMaat = [
      {
        ...BESTELLINGEN[0],
        lines: [{ id: 'line-3', kunstwerkId: 'kw-1', maatId: '', materiaalId: 'mat-1', breedte: 90, hoogte: 140, prijs: null, quantity: 1 }],
      },
    ];
    const { onLinePrijsVastgesteld } = renderSection({ bestellingen: bestellingenMetEigenMaat });
    fireEvent.click(screen.getByTestId('data-table-row-header-1'));
    fireEvent.change(screen.getByTestId('bestelling-modal-prijs-input-line-3'), { target: { value: '275' } });
    fireEvent.click(screen.getByTestId('bestelling-modal-prijs-vaststellen-line-3'));

    await waitFor(() => expect(onLinePrijsVastgesteld).toHaveBeenCalledWith('header-1', 'line-3', 275));
    expect(screen.getByTestId('bestelling-modal')).toBeInTheDocument();
    expect(screen.getByTestId('bestelling-modal-line-line-3')).toHaveTextContent('€ 275,00');
  });

  describe('bulk selection', () => {
    it('shows a checkbox only for bestellingen with status "Te versturen naar drukker"', () => {
      const bestellingen = [
        { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
        BESTELLINGEN[1],
      ];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-quick-all'));
      expect(screen.getByTestId('data-table-row-select-header-1')).toBeInTheDocument();
      expect(screen.queryByTestId('data-table-row-select-header-2')).not.toBeInTheDocument();
    });

    it('shows the selection bar with a count once a bestelling is selected, and hides it when deselected', () => {
      const bestellingen = [{ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const }];
      renderSection({ bestellingen });
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('1 bestellingen geselecteerd (1 klanten)');
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('counts distinct klanten in the selection bar', () => {
      const bestellingen = [
        { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
        { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const },
      ];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('data-table-row-select-header-3'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toHaveTextContent('2 bestellingen geselecteerd (2 klanten)');
    });

    it('clears the selection when the underlying bestellingen list changes to no longer include a selected id', () => {
      const bestellingen = [{ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const }];
      const { rerender } = renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.getByTestId('bestellingen-selectie-balk')).toBeInTheDocument();
      rerender(bestellingen.map((b) => ({ ...b, status: 'Verstuurd naar drukker' as const })));
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });

    it('opens the VersturenNaarDrukkerDialog with only the selected bestellingen when the button is clicked', () => {
      const bestellingen = [
        { ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const },
        { ...BESTELLINGEN[1], id: 'header-3', status: 'Te versturen naar drukker' as const },
      ];
      renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      expect(screen.getByTestId('drukker-versturen-drukker')).toHaveValue('drukker-1');
      expect(screen.getByTestId('drukker-versturen-preview')).toHaveTextContent('Testbedrijf BV');
      expect(screen.getByTestId('drukker-versturen-preview')).not.toHaveTextContent('Ander Bedrijf');
    });

    it('reports each verstuurde bestelling, clears the selection, and closes the dialog on a successful send', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      updateDocMock.mockResolvedValue(undefined);
      addDocMock.mockResolvedValue(undefined);
      const bestellingen = [{ ...BESTELLINGEN[0], status: 'Te versturen naar drukker' as const }];
      const { onBestellingUpdated } = renderSection({ bestellingen });
      fireEvent.click(screen.getByTestId('data-table-row-select-header-1'));
      fireEvent.click(screen.getByTestId('bestellingen-versturen-naar-drukker'));

      fireEvent.click(screen.getByTestId('drukker-versturen-versturen'));

      await waitFor(() => expect(onBestellingUpdated).toHaveBeenCalled());
      expect(onBestellingUpdated.mock.calls[0][0]).toEqual({ ...bestellingen[0], status: 'Verstuurd naar drukker' });
      expect(screen.queryByTestId('drukker-versturen-drukker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bestellingen-selectie-balk')).not.toBeInTheDocument();
    });
  });
});
