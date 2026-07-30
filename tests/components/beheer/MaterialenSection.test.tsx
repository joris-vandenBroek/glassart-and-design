import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MaterialenSection } from '@/components/beheer/MaterialenSection';
import type { Materiaal, Materiaalsoort, Kunstwerk } from '@/components/beheer/materiaalTypes';
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

const KUNSTWERKEN: Kunstwerk[] = [
  {
    id: 'kw-1',
    foto: 'https://example.com/kw-1.jpg',
    naam: 'Hotel paneel',
    kunstenaarId: null,
    segmentIds: [],
    materiaalIds: ['mat-1'],
    maatIds: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

const SOORTEN: Materiaalsoort[] = [
  { id: 'soort-1', omschrijving: 'Veiligheidsglas' },
  { id: 'soort-2', omschrijving: 'Acryl' },
];

const MATERIALEN: Materiaal[] = [
  { id: 'mat-1', materiaalsoortId: 'soort-1', materiaaldikte: 4, omschrijving: 'Kristalhelder' },
  { id: 'mat-2', materiaalsoortId: 'soort-2', materiaaldikte: 3, omschrijving: 'Licht en helder' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof MaterialenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MaterialenSection
        materialen={MATERIALEN}
        materiaalsoorten={SOORTEN}
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

describe('MaterialenSection', () => {
  beforeEach(() => {
    logActiviteitMock.mockReset();
  });

  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('materialen-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while materialen is null and there is no error', () => {
    renderSection({ materialen: null });
    expect(screen.queryByTestId('materialen-section')).not.toBeInTheDocument();
  });

  it('shows the materiaalsoort name (not the raw id) in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('Veiligheidsglas');
    expect(screen.getByTestId('data-table-row-mat-1')).toHaveTextContent('4');
    expect(screen.getByTestId('data-table-row-mat-2')).toHaveTextContent('Acryl');
  });

  it('filters by materiaalsoort name via the global search', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'Acryl' } });
    expect(screen.queryByTestId('data-table-row-mat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-mat-2')).toBeInTheDocument();
  });

  it('adds a new materiaal with the selected materiaalsoort, dikte and omschrijving', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-materiaalsoort'), { target: { value: 'soort-2' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), {
      target: { value: 'Extra diepte' },
    });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        materiaalsoortId: 'soort-2',
        materiaaldikte: 5,
        omschrijving: 'Extra diepte',
      })
    );
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    expect(screen.getByTestId('materiaal-modal-materiaalsoort')).toHaveValue('soort-1');
    expect(screen.getByTestId('materiaal-modal-dikte')).toHaveValue(4);
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('mat-1', {
        materiaalsoortId: 'soort-1',
        materiaaldikte: 6,
        omschrijving: 'Kristalhelder',
      })
    );
  });

  it('accepts 0 as a valid dikte', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Stof' } });
    expect(screen.getByTestId('materiaal-modal-opslaan')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ materiaaldikte: 0 })));
  });

  it('deletes a materiaal', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('mat-2'));
  });

  it('shows an action error and keeps the modal open when deleting fails', async () => {
    const onRemove = vi.fn().mockResolvedValue(false);
    renderSection({ onRemove });
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    expect(await screen.findByTestId('materiaal-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('materiaal-modal')).toBeInTheDocument();
  });

  it('blocks deleting a materiaal that is still referenced by a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    expect(await screen.findByTestId('materiaal-modal-error')).toHaveTextContent(
      'Dit materiaal is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a materiaal with no linked kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('mat-2'));
  });

  it('logs materiaal_toegevoegd when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    fireEvent.change(screen.getByTestId('materiaal-modal-dikte'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Nieuw' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Nieuw'
      )
    );
  });

  it('logs materiaal_gewijzigd when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.change(screen.getByTestId('materiaal-modal-omschrijving'), { target: { value: 'Bijgewerkt' } });
    fireEvent.click(screen.getByTestId('materiaal-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Bijgewerkt'
      )
    );
  });

  it('logs materiaal_verwijderd when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'materiaal_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        'Licht en helder'
      )
    );
  });

  it('does not log when a blocked delete is attempted', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-mat-1'));
    fireEvent.click(screen.getByTestId('materiaal-modal-verwijderen'));
    await screen.findByTestId('materiaal-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('materialen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaal toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-mat-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Materiaal bewerken');
  });
});
