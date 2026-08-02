import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StijlenSection } from '@/components/beheer/StijlenSection';
import type { Stijl, Kunstwerk } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

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

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const STIJLEN: Stijl[] = [
  { id: 'stijl-1', omschrijving: 'Modern' },
  { id: 'stijl-2', omschrijving: 'Klassiek' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Klassiek paneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: [],
    maatIds: [],
    stijlIds: ['stijl-2'],
    omschrijvingNl: 'Klassiek paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof StijlenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <StijlenSection
        stijlen={STIJLEN}
        kunstwerken={KUNSTWERKEN}
        loadError={null}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
  return { onAdd, onUpdate, onRemove };
}

describe('StijlenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('stijlen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while stijlen is null and there is no error', () => {
    renderSection({ stijlen: null });
    expect(screen.queryByTestId('stijlen-section')).not.toBeInTheDocument();
  });

  it('lists the stijlen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-stijl-1')).toHaveTextContent('Modern');
    expect(screen.getByTestId('data-table-row-stijl-2')).toHaveTextContent('Klassiek');
  });

  it('adds a new stijl and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Minimalistisch' }));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('stijl-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('stijl-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    expect(screen.getByTestId('stijl-modal-omschrijving')).toHaveValue('Klassiek');
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Klassiek design' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('stijl-2', { omschrijving: 'Klassiek design' }));
  });

  it('deletes a stijl that is not linked to any kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-1'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('stijl-1'));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
  });

  it('shows a delete confirmation with the usage count when the stijl is still linked to a kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    expect(screen.getByTestId('stijl-modal-verwijder-bevestiging')).toHaveTextContent(
      'Deze stijl wordt nog gebruikt door 1 kunstwerk(en). Weet je zeker dat je het wilt verwijderen?'
    );
    expect(screen.queryByTestId('stijl-modal-opslaan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stijl-modal-verwijderen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stijl-modal-omschrijving')).not.toBeInTheDocument();
  });

  it('cancels the delete confirmation and returns to the normal edit view', () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijder-annuleren'));
    expect(screen.getByTestId('stijl-modal-omschrijving')).toHaveValue('Klassiek');
    expect(screen.queryByTestId('stijl-modal-verwijder-bevestiging')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes the stijl after confirming when it is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('stijl-2'));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    expect(await screen.findByTestId('stijl-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('stijl-modal')).toBeInTheDocument();
  });

  it('logs stijl_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs stijl_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Klassiek design' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_gewijzigd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('logs stijl_verwijderd with the logged-in medewerker when deleting a stijl not in use', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-1'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_verwijderd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await screen.findByTestId('stijl-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Stijl toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Stijl bewerken');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    expect(screen.getByTestId('stijl-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
