import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MatenSection } from '@/components/beheer/MatenSection';
import type { Maat, Kunstwerk } from '@/components/beheer/materiaalTypes';
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
    materiaalIds: [],
    maatIds: ['maat-1'],
    prijzen: [],
    omschrijvingNl: 'Hotel paneel',
    omschrijvingFr: '',
    omschrijvingDe: '',
    omschrijvingEn: '',
  },
];

const MATEN: Maat[] = [
  { id: 'maat-1', breedte: 40, hoogte: 60 },
  { id: 'maat-2', breedte: 60, hoogte: 90 },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof MatenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MatenSection
        maten={MATEN}
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

describe('MatenSection', () => {
  beforeEach(() => {
    logActiviteitMock.mockReset();
  });

  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('maten-error')).toHaveTextContent('Kon niet laden.');
  });

  it('renders nothing while maten is null and there is no error', () => {
    renderSection({ maten: null });
    expect(screen.queryByTestId('maten-section')).not.toBeInTheDocument();
  });

  it('lists the maten in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-maat-1')).toHaveTextContent('40');
    expect(screen.getByTestId('data-table-row-maat-1')).toHaveTextContent('60');
  });

  it('adds a new maat', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '80' } });
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ breedte: 80, hoogte: 120 }));
  });

  it('disables Opslaan until both breedte and hoogte are filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    expect(screen.getByTestId('maat-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '80' } });
    expect(screen.getByTestId('maat-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '120' } });
    expect(screen.getByTestId('maat-modal-opslaan')).not.toBeDisabled();
  });

  it('disables Opslaan when breedte or hoogte is 0', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '120' } });
    expect(screen.getByTestId('maat-modal-opslaan')).toBeDisabled();
  });

  it('opens a row for editing pre-filled, and updates it', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    expect(screen.getByTestId('maat-modal-breedte')).toHaveValue(60);
    expect(screen.getByTestId('maat-modal-hoogte')).toHaveValue(90);
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('maat-2', { breedte: 60, hoogte: 100 }));
  });

  it('deletes a maat', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('maat-2'));
  });

  it('shows an action error and keeps the modal open when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('maten-add'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '80' } });
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    expect(await screen.findByTestId('maat-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('maat-modal')).toBeInTheDocument();
  });

  it('blocks deleting a maat that is still referenced by a kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    expect(await screen.findByTestId('maat-modal-error')).toHaveTextContent(
      'Deze maat is nog gekoppeld aan een kunstwerk en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a maat with no linked kunstwerk', async () => {
    const { onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('maat-2'));
  });

  it('logs maat_toegevoegd when adding', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    fireEvent.change(screen.getByTestId('maat-modal-breedte'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '70' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'maat_toegevoegd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        '50×70 cm'
      )
    );
  });

  it('logs maat_gewijzigd when editing', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.change(screen.getByTestId('maat-modal-hoogte'), { target: { value: '100' } });
    fireEvent.click(screen.getByTestId('maat-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'maat_gewijzigd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        '60×100 cm'
      )
    );
  });

  it('logs maat_verwijderd when deleting', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith(
        'maat_verwijderd',
        { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
        '60×90 cm'
      )
    );
  });

  it('does not log when a blocked delete is attempted', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-maat-1'));
    fireEvent.click(screen.getByTestId('maat-modal-verwijderen'));
    await screen.findByTestId('maat-modal-error');
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Maat toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-maat-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Maat bewerken');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    expect(screen.getByTestId('maat-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  it('marks the Breedte label as required with an asterisk', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('maten-add'));
    const label = screen.getByTestId('maat-modal-breedte').closest('label');
    expect(label).toHaveTextContent('Breedte (cm) *');
  });
});
