import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CategorieenSection } from '@/components/beheer/CategorieenSection';
import type { Categorie, Kunstwerk } from '@/components/beheer/materiaalTypes';
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

const CATEGORIEEN: Categorie[] = [
  { id: 'ond-1', omschrijvingNl: 'Abstract', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'ond-2', omschrijvingNl: 'Landschap', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    code: 'Landschapspaneel',
    kunstenaarnr: null,
    segmentIds: [],
    materiaalIds: [],
    maatIds: [],
    categorieIds: ['ond-2'],
    omschrijvingNl: 'Landschapspaneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof CategorieenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CategorieenSection
        categorieen={CATEGORIEEN}
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

describe('CategorieenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('categorieen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while categorieen is null and there is no error', () => {
    renderSection({ categorieen: null });
    expect(screen.queryByTestId('categorieen-section')).not.toBeInTheDocument();
  });

  it('lists the categorieen in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-ond-1')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('data-table-row-ond-2')).toHaveTextContent('Landschap');
  });

  it('adds a new categorie and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('categorieen-add'));
    fireEvent.change(screen.getByTestId('categorie-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('categorie-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        omschrijvingNl: 'Portret',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
    await waitFor(() => expect(screen.queryByTestId('categorie-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('categorieen-add'));
    expect(screen.getByTestId('categorie-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('categorie-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('categorie-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    expect(screen.getByTestId('categorie-modal-omschrijving')).toHaveValue('Landschap');
    fireEvent.change(screen.getByTestId('categorie-modal-omschrijving'), { target: { value: 'Landschappen' } });
    fireEvent.click(screen.getByTestId('categorie-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('ond-2', {
        omschrijvingNl: 'Landschappen',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
      })
    );
  });

  it('deletes an categorie that is not linked to any kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-1'));
    fireEvent.click(screen.getByTestId('categorie-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ond-1'));
    await waitFor(() => expect(screen.queryByTestId('categorie-modal')).not.toBeInTheDocument());
  });

  it('shows a delete confirmation with the usage count when the categorie is still linked to a kunstwerk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('categorie-modal-verwijderen'));
    expect(screen.getByTestId('categorie-modal-verwijder-bevestiging')).toHaveTextContent(
      'Deze categorie wordt nog gebruikt door 1 kunstwerk(en). Weet je zeker dat je hem wilt verwijderen?'
    );
    expect(screen.queryByTestId('categorie-modal-opslaan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('categorie-modal-verwijderen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('categorie-modal-omschrijving')).not.toBeInTheDocument();
  });

  it('cancels the delete confirmation and returns to the normal edit view', () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('categorie-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('categorie-modal-verwijder-annuleren'));
    expect(screen.getByTestId('categorie-modal-omschrijving')).toHaveValue('Landschap');
    expect(screen.queryByTestId('categorie-modal-verwijder-bevestiging')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes the categorie after confirming when it is still linked to a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.click(screen.getByTestId('categorie-modal-verwijderen'));
    fireEvent.click(screen.getByTestId('categorie-modal-verwijder-bevestigen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('ond-2'));
    await waitFor(() => expect(screen.queryByTestId('categorie-modal')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'categorie_verwijderd',
        'Landschap'
      )
    );
  });

  it('shows an action error and keeps the modal open when onAdd fails', async () => {
    renderSection({ onAdd: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByTestId('categorieen-add'));
    fireEvent.change(screen.getByTestId('categorie-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('categorie-modal-opslaan'));
    expect(await screen.findByTestId('categorie-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('categorie-modal')).toBeInTheDocument();
  });

  it('logs categorie_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('categorieen-add'));
    fireEvent.change(screen.getByTestId('categorie-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('categorie-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'categorie_toegevoegd',
        'Portret'
      )
    );
  });

  it('logs categorie_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    fireEvent.change(screen.getByTestId('categorie-modal-omschrijving'), { target: { value: 'Landschappen' } });
    fireEvent.click(screen.getByTestId('categorie-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'categorie_gewijzigd',
        'Landschappen'
      )
    );
  });

  it('logs categorie_verwijderd with the logged-in medewerker when deleting an categorie not in use', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-ond-1'));
    fireEvent.click(screen.getByTestId('categorie-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'categorie_verwijderd',
        'Abstract'
      )
    );
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('categorieen-add'));
    fireEvent.change(screen.getByTestId('categorie-modal-omschrijving'), { target: { value: 'Portret' } });
    fireEvent.click(screen.getByTestId('categorie-modal-opslaan'));
    await screen.findByTestId('categorie-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the same "Categoriegegevens" title when adding and when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('categorieen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Categoriegegevens');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-ond-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Categoriegegevens');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('categorieen-add'));
    expect(screen.getByTestId('categorie-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
