import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MateriaalsoortenSection } from '@/components/beheer/MateriaalsoortenSection';
import type { Materiaalsoort, Materiaal } from '@/components/beheer/materiaalTypes';
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

const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijvingNl: 'Veiligheidsglas', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
  { id: 'soort-2', omschrijvingNl: 'Dibond', omschrijvingFr: '', omschrijvingDe: '', omschrijvingEn: '' },
];

const MATERIALEN: Materiaal[] = [
  {
    id: 'mat-1',
    materiaalsoortId: 'soort-1',
    materiaaldikte: 4,
    omschrijvingNl: 'Test',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof MateriaalsoortenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MateriaalsoortenSection
        materiaalsoorten={SOORTEN}
        materialen={MATERIALEN}
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

describe('MateriaalsoortenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('materiaalsoorten-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while materiaalsoorten is null and there is no error', () => {
    renderSection({ materiaalsoorten: null });
    expect(screen.queryByTestId('materiaalsoorten-section')).not.toBeInTheDocument();
  });

  it('lists the materiaalsoorten in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-soort-1')).toHaveTextContent('Veiligheidsglas');
    expect(screen.getByTestId('data-table-row-soort-2')).toHaveTextContent('Dibond');
  });

  it('adds a new materiaalsoort and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), {
      target: { value: 'Acryl' },
    });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        omschrijvingNl: 'Acryl',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        staatEigenMaatToe: false,
        maxBreedte: null,
        maxHoogte: null,
        levertijdMaandenEigenMaat: null,
      })
    );
    await waitFor(() => expect(screen.queryByTestId('materiaalsoort-modal')).not.toBeInTheDocument());
  });

  it('disables Opslaan until omschrijving is filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.getByTestId('materiaalsoort-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'X' } });
    expect(screen.getByTestId('materiaalsoort-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    expect(screen.getByTestId('materiaalsoort-modal-omschrijving')).toHaveValue('Dibond');
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Dibond 3mm' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('soort-2', {
        omschrijvingNl: 'Dibond 3mm',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        staatEigenMaatToe: false,
        maxBreedte: null,
        maxHoogte: null,
        levertijdMaandenEigenMaat: null,
      })
    );
  });

  it('blocks deleting a materiaalsoort that still has materialen referencing it', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-1'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    expect(await screen.findByTestId('materiaalsoort-modal-error')).toHaveTextContent(
      'Deze materiaalsoort is nog gekoppeld aan materialen en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a materiaalsoort with no linked materialen', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('soort-2'));
    await waitFor(() => expect(screen.queryByTestId('materiaalsoort-modal')).not.toBeInTheDocument());
  });

  it('shows an action error and keeps the modal open when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), {
      target: { value: 'Acryl' },
    });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    expect(await screen.findByTestId('materiaalsoort-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('materiaalsoort-modal')).toBeInTheDocument();
  });

  it('logs materiaalsoort_toegevoegd with the logged-in medewerker when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Acryl' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaalsoort_toegevoegd',
        'Acryl'
      )
    );
  });

  it('logs materiaalsoort_gewijzigd with the logged-in medewerker when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Dibond 3mm' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaalsoort_gewijzigd',
        'Dibond 3mm'
      )
    );
  });

  it('logs materiaalsoort_verwijderd with the logged-in medewerker when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaalsoort_verwijderd',
        'Dibond'
      )
    );
  });

  it('does not log when a blocked delete is attempted', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-soort-1'));
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-verwijderen'));
    await screen.findByTestId('materiaalsoort-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Acryl' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await screen.findByTestId('materiaalsoort-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the max-afmeting and levertijd fields only when "staat eigen maat toe" is checked', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.queryByTestId('materiaalsoort-modal-max-breedte')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-eigen-maat'));
    expect(screen.getByTestId('materiaalsoort-modal-max-breedte')).toBeInTheDocument();
    expect(screen.getByTestId('materiaalsoort-modal-max-hoogte')).toBeInTheDocument();
    expect(screen.getByTestId('materiaalsoort-modal-levertijd-maanden')).toBeInTheDocument();
  });

  it('saves the eigen-maat fields when adding with "staat eigen maat toe" checked', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-omschrijving'), { target: { value: 'Acryl' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-eigen-maat'));
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-max-breedte'), { target: { value: '200' } });
    fireEvent.change(screen.getByTestId('materiaalsoort-modal-max-hoogte'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('materiaalsoort-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        omschrijvingNl: 'Acryl',
        omschrijvingFr: '',
        omschrijvingDe: '',
        omschrijvingEn: '',
        staatEigenMaatToe: true,
        maxBreedte: 200,
        maxHoogte: 300,
        levertijdMaandenEigenMaat: null,
      })
    );
  });

  it('pre-fills the eigen-maat fields when editing a materiaalsoort that has them set', () => {
    renderSection({
      materiaalsoorten: [
        {
          id: 'soort-1',
          omschrijvingNl: 'Veiligheidsglas',
          omschrijvingFr: '',
          omschrijvingDe: '',
          omschrijvingEn: '',
          staatEigenMaatToe: true,
          levertijdMaandenEigenMaat: 3,
        },
      ],
    });
    fireEvent.click(screen.getByTestId('data-table-row-soort-1'));
    expect(screen.getByTestId('materiaalsoort-modal-eigen-maat')).toBeChecked();
    expect(screen.getByTestId('materiaalsoort-modal-levertijd-maanden')).toHaveValue(3);
  });

  it('shows the same "Materiaalsoortgegevens" title when adding and when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaalsoortgegevens');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-soort-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaalsoortgegevens');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materiaalsoorten-add'));
    expect(screen.getByTestId('materiaalsoort-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });
});
