import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DrukkersSection } from '@/components/beheer/DrukkersSection';
import type { Drukker } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();
const fetchMock = vi.fn();
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

const DRUKKERS: Drukker[] = [
  {
    id: 'drukker-1',
    naam: 'Drukkerij Janssen',
    adres: 'Perslaan 1',
    postcode: '1000 AA',
    plaats: 'Utrecht',
    email: 'info@janssen.nl',
    prijsafspraken: '10% korting boven 50 stuks.',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof DrukkersSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  const onBestellingUpdated = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <DrukkersSection
        drukkers={DRUKKERS}
        bestellingen={[]}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onBestellingUpdated={onBestellingUpdated}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove, onBestellingUpdated };
}

beforeEach(() => {
  logActiviteitMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
});

describe('DrukkersSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('drukkers-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while drukkers is null and there is no error', () => {
    renderSection({ drukkers: null });
    expect(screen.queryByTestId('drukkers-section')).not.toBeInTheDocument();
  });

  it('lists the drukkers in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-drukker-1')).toHaveTextContent('Drukkerij Janssen');
    expect(screen.getByTestId('data-table-row-drukker-1')).toHaveTextContent('Utrecht');
  });

  it('shows a Standaard badge next to the standaard drukker and not next to others', () => {
    renderSection({
      drukkers: [
        DRUKKERS[0],
        { ...DRUKKERS[0], id: 'drukker-2', naam: 'Drukkerij Tweede', standaard: true },
      ],
    });
    expect(screen.getByTestId('data-table-row-drukker-1')).not.toHaveTextContent('Standaard');
    expect(screen.getByTestId('data-table-row-drukker-2')).toHaveTextContent('Standaard');
  });

  it('adds a new drukker, closes the modal, and logs drukker_toegevoegd', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('drukkers-add'));
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'Nieuwe Drukker' } });
    fireEvent.change(screen.getByTestId('drukker-modal-adres'), { target: { value: 'Straat 1' } });
    fireEvent.change(screen.getByTestId('drukker-modal-postcode'), { target: { value: '1111 AA' } });
    fireEvent.change(screen.getByTestId('drukker-modal-plaats'), { target: { value: 'Stad' } });
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'info@nieuw.nl' } });
    fireEvent.change(screen.getByTestId('drukker-modal-prijsafspraken'), { target: { value: 'Geen korting.' } });
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        naam: 'Nieuwe Drukker',
        adres: 'Straat 1',
        postcode: '1111 AA',
        plaats: 'Stad',
        email: 'info@nieuw.nl',
        prijsafspraken: 'Geen korting.',
        standaard: false,
      })
    );
    await waitFor(() => expect(screen.queryByTestId('drukker-modal')).not.toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'drukker_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Nieuwe Drukker'
    );
  });

  it('disables Opslaan until naam and email are filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('drukkers-add'));
    expect(screen.getByTestId('drukker-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'X' } });
    expect(screen.getByTestId('drukker-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'x@y.nl' } });
    expect(screen.getByTestId('drukker-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, updates it, and logs drukker_gewijzigd', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-drukker-1'));
    expect(screen.getByTestId('drukker-modal-naam')).toHaveValue('Drukkerij Janssen');
    fireEvent.change(screen.getByTestId('drukker-modal-plaats'), { target: { value: 'Amersfoort' } });
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('drukker-1', {
        naam: 'Drukkerij Janssen',
        adres: 'Perslaan 1',
        postcode: '1000 AA',
        plaats: 'Amersfoort',
        email: 'info@janssen.nl',
        prijsafspraken: '10% korting boven 50 stuks.',
        standaard: false,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'drukker_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Drukkerij Janssen'
    );
  });

  it('deletes a drukker with no zendingen and logs drukker_verwijderd', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-drukker-1'));
    await waitFor(() => expect(screen.getByTestId('drukker-modal-verwijderen')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('drukker-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('drukker-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'drukker_verwijderd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Drukkerij Janssen'
    );
  });

  it('shows an action error and does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('drukkers-add'));
    fireEvent.change(screen.getByTestId('drukker-modal-naam'), { target: { value: 'X' } });
    fireEvent.change(screen.getByTestId('drukker-modal-email'), { target: { value: 'x@y.nl' } });
    fireEvent.click(screen.getByTestId('drukker-modal-opslaan'));
    expect(await screen.findByTestId('drukker-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });
});
