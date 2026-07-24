import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BestellingenSection, type Bestelling } from '@/components/beheer/BestellingenSection';
import type { Kunstwerk, Materiaal, Maat, Materiaalsoort } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
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
    status: 'Goedgekeurd',
    lineCount: 1,
    totalQuantity: 1,
    lines: [{ id: 'line-2', kunstwerkId: 'kw-1', maatId: 'maat-1', materiaalId: 'mat-1', prijs: 150, quantity: 1 }],
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof BestellingenSection>> = {}) {
  const onBestellingUpdated = vi.fn();
  const onLinePrijsVastgesteld = vi.fn();
  const onLineUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <BestellingenSection
        bestellingen={BESTELLINGEN}
        kunstwerken={KUNSTWERKEN}
        materialen={MATERIALEN}
        maten={MATEN}
        materiaalsoorten={MATERIAALSOORTEN}
        loadError={null}
        onBestellingUpdated={onBestellingUpdated}
        onLinePrijsVastgesteld={onLinePrijsVastgesteld}
        onLineUpdated={onLineUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onBestellingUpdated, onLinePrijsVastgesteld, onLineUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
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

  it('shows only the "Te beoordelen" bestelling by default (status filter defaults to Te beoordelen)', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-header-2')).not.toBeInTheDocument();
  });

  it('shows all bestellingen after clicking the "alle bestellingen" quick filter link', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-quick-all'));
    expect(screen.getByTestId('data-table-row-header-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-header-2')).toBeInTheDocument();
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
      expect(onBestellingUpdated).toHaveBeenCalledWith({ ...BESTELLINGEN[0], status: 'Goedgekeurd' })
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
});
