import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnderwerpenSection } from '@/components/beheer/OnderwerpenSection';
import type { Onderwerp, Kunstwerk } from '@/components/beheer/materiaalTypes';
import messages from '../../../messages/nl.json';

const logActiviteitMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({ user: { uid: 'staff-1', email: 'paul@glassartanddesign.com' } }),
}));

vi.mock('@/lib/logActiviteit', () => ({
  logActiviteit: (...args: unknown[]) => logActiviteitMock(...args),}));

beforeEach(() => {
  logActiviteitMock.mockReset();
});

const ONDERWERPEN: Onderwerp[] = [
  { id: 'ond-1', omschrijving: 'Abstract' },
  { id: 'ond-2', omschrijving: 'Landschap' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    code: 'Landschapspaneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: [],
    maatIds: [],
    onderwerpIds: ['ond-2'],
    omschrijvingNl: 'Landschapspaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof OnderwerpenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <OnderwerpenSection
        onderwerpen={ONDERWERPEN}
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

describe('OnderwerpenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('onderwerpen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while onderwerpen is null and there is no error', () => {
    renderSection({ onderwerpen: null });
    expect(screen.queryByTestId('onderwerpen-section')).not.toBeInTheDocument();
  });

  it('lists the onderwerpen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-ond-1')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('data-table-row-ond-2')).toHaveTextContent('Landschap');
  });

  it('adds a new onderwerp and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Portret' }));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('onderwerp-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('onderwerp-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    expect(screen.getByTestId('onderwerp-modal-omschrijving')).toHaveValue('Landschap');
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Landschappen' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('ond-2', { omschrijving: 'Landschappen' }));
  });

  it('deletes an onderwerp that is not linked to any kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-1'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ond-1'));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
  });

  it('shows a delete confirmation with the usage count when the onderwerp is still linked to a kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    expect(screen.getByTestId('onderwerp-modal-verwijder-bevestiging')).toHaveTextContent(
      'Dit onderwerp wordt nog gebruikt door 1 kunstwerk(en). Weet je zeker dat je het wilt verwijderen?'
    );
    expect(screen.queryByTestId('onderwerp-modal-opslaan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onderwerp-modal-verwijderen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onderwerp-modal-omschrijving')).not.toBeInTheDocument();
  });

  it('cancels the delete confirmation and returns to the normal edit view', () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijder-annuleren'));
    expect(screen.getByTestId('onderwerp-modal-omschrijving')).toHaveValue('Landschap');
    expect(screen.queryByTestId('onderwerp-modal-verwijder-bevestiging')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes the onderwerp after confirming when it is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ond-2'));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'onderwerp_verwijderd',
        'Landschap'
      )
    );
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    expect(await screen.findByTestId('onderwerp-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('onderwerp-modal')).toBeInTheDocument();
  });

  it('logs onderwerp_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'onderwerp_toegevoegd',
        'Portret'
      )
    );
  });

  it('logs onderwerp_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Landschappen' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'onderwerp_gewijzigd',
        'Landschappen'
      )
    );
  });

  it('logs onderwerp_verwijderd with the logged-in medewerker when deleting an onderwerp not in use', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-1'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'onderwerp_verwijderd',
        'Abstract'
      )
    );
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await screen.findByTestId('onderwerp-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp bewerken');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('onderwerp-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
