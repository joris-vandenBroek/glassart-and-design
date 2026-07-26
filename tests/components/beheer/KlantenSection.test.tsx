import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantenSection, type Klant } from '@/components/beheer/KlantenSection';
import type { Prijsgroep } from '@/components/beheer/materiaalTypes';
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
    status: 'Beoordelen',
    prijsgroepId: null,
  },
  {
    id: 'uid-2',
    companyName: 'Ander Bedrijf',
    kvk: '87654321',
    contactPerson: 'Piet Pietersen',
    email: 'piet@example.com',
    phone: '0698765432',
    contactPreference: 'phone',
    address: 'Anderstraat 2',
    postcode: '4321 BA',
    city: 'Anderstad',
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

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0 },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10 },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof KlantenSection>> = {}) {
  const onKlantUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantenSection
        klanten={KLANTEN}
        prijsgroepen={PRIJSGROEPEN}
        loadError={null}
        onKlantUpdated={onKlantUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onKlantUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
});

describe('KlantenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('klanten-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while klanten is null and there is no error', () => {
    renderSection({ klanten: null });
    expect(screen.queryByTestId('klanten-section')).not.toBeInTheDocument();
  });

  it('shows all klanten by default (status filter defaults to "alle klanten")', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-uid-1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-uid-2')).toBeInTheDocument();
  });

  it('shows only the "Beoordelen" klant after clicking the "te beoordelen" quick filter link', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-quick-active'));
    expect(screen.getByTestId('data-table-row-uid-1')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-uid-2')).not.toBeInTheDocument();
  });

  it('opens the KlantModal with the clicked klant\'s data when a row is clicked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-uid-1'));
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
  });

  it('closes the modal and reports the updated klant via onKlantUpdated after approving', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onKlantUpdated } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-uid-1'));
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() =>
      expect(onKlantUpdated).toHaveBeenCalledWith({ ...KLANTEN[0], status: 'Goedgekeurd', prijsgroepId: 'pg-2' })
    );
    await waitFor(() => expect(screen.queryByTestId('klant-modal')).not.toBeInTheDocument());
  });
});
