import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DrukkerModal } from '@/components/beheer/DrukkerModal';
import type { Drukker } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ name: segments.join('/') })),
  query: vi.fn((collectionRef) => collectionRef),
  orderBy: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: vi.fn(),
  actorFromMedewerker: () => ({ id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' }),
}));

const DRUKKER: Drukker = {
  id: 'drukker-1',
  naam: 'Drukkerij Janssen',
  adres: 'Perslaan 1',
  postcode: '1000 AA',
  plaats: 'Utrecht',
  email: 'info@janssen.nl',
  prijsafspraken: '',
};

function renderModal(state: { mode: 'edit'; drukker: Drukker } | { mode: 'add' } | null) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkerModal state={state} onClose={onClose} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} />
    </NextIntlClientProvider>
  );
  return { onClose, onAdd, onUpdate, onRemove };
}

beforeEach(() => {
  getDocsMock.mockReset();
});

describe('DrukkerModal zendingen', () => {
  it('shows "nog geen mails verzonden" once loaded empty', async () => {
    getDocsMock.mockResolvedValue({ docs: [] });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(await screen.findByTestId('drukker-modal-zendingen-leeg')).toHaveTextContent(
      'Nog geen mails verzonden.'
    );
  });

  it('lists zendingen and expands one to show the full mail body', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'zending-1',
          data: () => ({
            verzondenOp: { toDate: () => new Date('2026-07-24T10:00:00Z') },
            onderwerp: 'Nieuwe order(s) voor de drukker – 24-7-2026',
            body: '== Testbedrijf BV ==\nAfleveradres: Teststraat 1, 1234 AB Teststad\n- Hotel paneel',
            bestellingIds: ['header-1'],
            aantalKlanten: 1,
            aantalRegels: 1,
            verzondDoor: 'paul@glassartanddesign.com',
          }),
        },
      ],
    });
    renderModal({ mode: 'edit', drukker: DRUKKER });
    const zendingRow = await screen.findByTestId('drukker-zending-zending-1');
    expect(zendingRow).toHaveTextContent('1');
    expect(screen.queryByText(/Testbedrijf BV/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drukker-zending-bekijken-zending-1'));
    expect(screen.getByText(/Testbedrijf BV/)).toBeInTheDocument();
  });

  it('disables Verwijderen while zendingen are still loading', () => {
    getDocsMock.mockReturnValue(new Promise(() => {}));
    renderModal({ mode: 'edit', drukker: DRUKKER });
    expect(screen.getByTestId('drukker-modal-verwijderen')).toBeDisabled();
  });

  it('blocks deleting a drukker that has zendingen', async () => {
    const onRemove = vi.fn();
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'zending-1',
          data: () => ({
            verzondenOp: null,
            onderwerp: 'x',
            body: 'x',
            bestellingIds: [],
            aantalKlanten: 1,
            aantalRegels: 1,
            verzondDoor: 'x',
          }),
        },
      ],
    });
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <DrukkerModal
          state={{ mode: 'edit', drukker: DRUKKER }}
          onClose={vi.fn()}
          onAdd={vi.fn()}
          onUpdate={vi.fn().mockResolvedValue(true)}
          onRemove={onRemove}
        />
      </NextIntlClientProvider>
    );
    await waitFor(() => expect(screen.getByTestId('drukker-modal-verwijderen')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-modal-verwijderen'));
    expect(await screen.findByTestId('drukker-modal-error')).toHaveTextContent(
      'Deze drukker heeft al verzonden mails en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });
});
