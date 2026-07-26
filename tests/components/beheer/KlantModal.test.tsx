import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantModal } from '@/components/beheer/KlantModal';
import type { Klant } from '@/components/beheer/KlantenSection';
import type { Prijsgroep } from '@/components/beheer/materiaalTypes';
import type { Kunstenaar } from '@/components/beheer/kunstenaarTypes';
import messages from '../../../messages/nl.json';

const updateDocMock = vi.fn();
const logActiviteitMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteField: vi.fn(() => ({ __sentinel: 'deleteField' })),
}));

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

const KLANT: Klant = {
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
  status: 'Beoordelen',
  prijsgroepId: null,
  exclusieveKunstenaarIds: [],
};

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0 },
  { id: 'pg-2', naam: 'Premium', kortingspercentage: 10 },
];

const KUNSTENAARS: Kunstenaar[] = [
  {
    id: 'ka-1',
    naam: 'Sabrina Glasser',
    foto: null,
    omschrijvingNl: 'Werkt met glas.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: null,
  },
  {
    id: 'ka-2',
    naam: 'Bram Steen',
    foto: null,
    omschrijvingNl: 'Werkt met steen.',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
    verkooprecht: 'open',
    klantId: null,
    exclusiefVoorKlantId: 'uid-2',
  },
];

function renderModal(
  klant: Klant | null,
  prijsgroepen: Prijsgroep[] | null = PRIJSGROEPEN,
  kunstenaars: Kunstenaar[] | null = KUNSTENAARS
) {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  const onKunstenaarUpdated = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantModal
        klant={klant}
        prijsgroepen={prijsgroepen}
        kunstenaars={kunstenaars}
        onKunstenaarUpdated={onKunstenaarUpdated}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onUpdated, onKunstenaarUpdated };
}

beforeEach(() => {
  updateDocMock.mockReset();
  logActiviteitMock.mockReset();
});

describe('KlantModal', () => {
  it('renders nothing when klant is null', () => {
    renderModal(null);
    expect(screen.queryByTestId('klant-modal')).not.toBeInTheDocument();
  });

  it('shows the klant details and pre-selects the prijsgroep dropdown', () => {
    renderModal({ ...KLANT, prijsgroepId: 'pg-1' });
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('12345678');
    expect(screen.getByTestId('klant-modal-prijsgroep')).toHaveValue('pg-1');
  });

  it('disables Goedkeuren until a prijsgroep is selected', () => {
    renderModal(KLANT);
    expect(screen.getByTestId('klant-modal-goedkeuren')).toBeDisabled();
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-1' } });
    expect(screen.getByTestId('klant-modal-goedkeuren')).not.toBeDisabled();
  });

  it('hides the Goedkeuren button when the klant is already Goedgekeurd', () => {
    renderModal({ ...KLANT, status: 'Goedgekeurd', prijsgroepId: 'pg-1' });
    expect(screen.queryByTestId('klant-modal-goedkeuren')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal-afwijzen')).toBeInTheDocument();
  });

  it('shows a prijsgroep Opslaan button once Goedgekeurd, and saves just the prijsgroep', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal({ ...KLANT, status: 'Goedgekeurd', prijsgroepId: 'pg-1' });
    expect(screen.getByTestId('klant-modal-prijsgroep-opslaan')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-prijsgroep-opslaan'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { prijsgroepId: 'pg-2' }
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({
        ...KLANT,
        status: 'Goedgekeurd',
        prijsgroepId: 'pg-2',
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith('klant_prijsgroep_gewijzigd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('does not show the prijsgroep Opslaan button while still Beoordelen', () => {
    renderModal({ ...KLANT, status: 'Beoordelen' });
    expect(screen.queryByTestId('klant-modal-prijsgroep-opslaan')).not.toBeInTheDocument();
  });

  it('keeps the other fields read-only until Bewerken is clicked', () => {
    renderModal(KLANT);
    expect(screen.queryByTestId('klant-modal-companyName')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Testbedrijf BV');
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    expect(screen.getByTestId('klant-modal-companyName')).toHaveValue('Testbedrijf BV');
  });

  it('saves all edited fields via Opslaan and exits edit mode', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-contactPerson'), { target: { value: 'Piet Pietersen' } });
    fireEvent.click(screen.getByTestId('klant-modal-velden-opslaan'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        {
          companyName: 'Testbedrijf BV',
          kvk: '12345678',
          contactPerson: 'Piet Pietersen',
          contactPreference: 'email',
          email: 'jan@example.com',
          phone: '0612345678',
          address: 'Teststraat 1',
          postcode: '1234 AB',
          city: 'Teststad',
        }
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, contactPerson: 'Piet Pietersen' }));
    expect(logActiviteitMock).toHaveBeenCalledWith('klant_gewijzigd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
    expect(screen.queryByTestId('klant-modal-companyName')).not.toBeInTheDocument();
  });

  it('discards edits when Annuleren is clicked', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-bewerken'));
    fireEvent.change(screen.getByTestId('klant-modal-contactPerson'), { target: { value: 'Gewijzigd' } });
    fireEvent.click(screen.getByTestId('klant-modal-annuleren'));
    expect(screen.queryByTestId('klant-modal-companyName')).not.toBeInTheDocument();
    expect(screen.getByTestId('klant-modal')).toHaveTextContent('Jan Jansen');
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('lists every prijsgroep as a dropdown option', () => {
    renderModal(KLANT);
    const options = screen.getByTestId('klant-modal-prijsgroep').querySelectorAll('option');
    expect(Array.from(options).map((option) => option.textContent)).toEqual(
      expect.arrayContaining(['Standaard', 'Premium'])
    );
  });

  it('approves the klant and calls onUpdated with the updated klant', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { status: 'Goedgekeurd', prijsgroepId: 'pg-2' }
      )
    );
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Goedgekeurd', prijsgroepId: 'pg-2' })
    );
  });

  it('rejects the klant and calls onUpdated with the updated klant', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { status: 'Afgewezen' }
      )
    );
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, status: 'Afgewezen' }));
  });

  it('shows an error and does not call onUpdated when updateDoc fails', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'));
    const { onUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));

    expect(await screen.findByTestId('klant-modal-error')).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('logs klant_goedgekeurd with the logged-in medewerker on approval', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(KLANT);
    fireEvent.change(screen.getByTestId('klant-modal-prijsgroep'), { target: { value: 'pg-2' } });
    fireEvent.click(screen.getByTestId('klant-modal-goedkeuren'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('klant_goedgekeurd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs klant_afgewezen with the logged-in medewerker on rejection', async () => {
    updateDocMock.mockResolvedValue(undefined);
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('klant_afgewezen', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when updateDoc fails', async () => {
    updateDocMock.mockRejectedValue(new Error('offline'));
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-afwijzen'));
    await screen.findByTestId('klant-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('toggles a kunstenaar checkbox on and saves exclusieveKunstenaarIds, updating the kunstenaar back-pointer', async () => {
    const { onUpdated, onKunstenaarUpdated } = renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-exclusief-ka-1'));
    fireEvent.click(screen.getByTestId('klant-modal-exclusiviteit-opslaan'));
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), { exclusieveKunstenaarIds: ['ka-1'] }));
    // The deleteField() sentinel is mandatory on every kunstenaars write: legacy
    // documents still carry prijsafspraken, and firestore.rules evaluates the MERGED
    // post-write document, so without it this back-pointer write would be rejected.
    await waitFor(() =>
      expect(onKunstenaarUpdated).toHaveBeenCalledWith('ka-1', {
        exclusiefVoorKlantId: 'uid-1',
        prijsafspraken: { __sentinel: 'deleteField' },
      })
    );
    expect(onUpdated).toHaveBeenCalledWith({ ...KLANT, exclusieveKunstenaarIds: ['ka-1'] });
    expect(logActiviteitMock).toHaveBeenCalledWith('klant_exclusiviteit_gewijzigd', {
      id: 'staff-1',
      email: 'paul@glassartanddesign.com',
      naam: 'paul@glassartanddesign.com',
    });
  });

  it('blocks checking a kunstenaar that another klant already holds exclusively', () => {
    renderModal(KLANT);
    fireEvent.click(screen.getByTestId('klant-modal-exclusief-ka-2'));
    expect(screen.getByTestId('klant-modal-error')).toHaveTextContent(
      'Deze kunstenaar is al exclusief toegewezen aan een andere klant.'
    );
    expect(screen.getByTestId('klant-modal-exclusief-ka-2')).not.toBeChecked();
  });

  it('allows unchecking a kunstenaar this klant already holds exclusively, clearing the back-pointer on save', async () => {
    const { onKunstenaarUpdated } = renderModal({ ...KLANT, exclusieveKunstenaarIds: ['ka-2'] }, PRIJSGROEPEN, [
      { ...KUNSTENAARS[1], exclusiefVoorKlantId: 'uid-1' },
    ]);
    fireEvent.click(screen.getByTestId('klant-modal-exclusief-ka-2'));
    fireEvent.click(screen.getByTestId('klant-modal-exclusiviteit-opslaan'));
    await waitFor(() =>
      expect(onKunstenaarUpdated).toHaveBeenCalledWith('ka-2', {
        exclusiefVoorKlantId: null,
        prijsafspraken: { __sentinel: 'deleteField' },
      })
    );
  });
});
