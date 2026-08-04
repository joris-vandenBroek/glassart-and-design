import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PrijsgroepenSection } from '@/components/beheer/PrijsgroepenSection';
import type { Prijsgroep } from '@/components/beheer/materiaalTypes';
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

const PRIJSGROEPEN: Prijsgroep[] = [
  { id: 'pg-1', naam: 'Standaard', kortingspercentage: 0, opslagpercentage: null },
  { id: 'pg-2', naam: 'Wholesale', kortingspercentage: '15.00' as unknown as number, opslagpercentage: null },
  { id: 'pg-3', naam: 'Duur', kortingspercentage: null, opslagpercentage: 8 },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof PrijsgroepenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <PrijsgroepenSection
        prijsgroepen={PRIJSGROEPEN}
        klanten={[]}
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

beforeEach(() => {
  logActiviteitMock.mockReset();
});

describe('PrijsgroepenSection', () => {
  it('shows the load error instead of the table when loadError is set', () => {
    renderSection({ loadError: 'Kon niet laden.' });
    expect(screen.getByTestId('prijsgroepen-error')).toHaveTextContent('Kon niet laden.');
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
  });

  it('renders nothing while prijsgroepen is null and there is no error', () => {
    renderSection({ prijsgroepen: null });
    expect(screen.queryByTestId('prijsgroepen-section')).not.toBeInTheDocument();
  });

  it('lists the prijsgroepen with their type and percentage in the table', () => {
    renderSection();
    expect(screen.getByTestId('data-table-row-pg-1')).toHaveTextContent('Standaard');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('Wholesale');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('Korting');
    expect(screen.getByTestId('data-table-row-pg-2')).toHaveTextContent('15%');
    expect(screen.getByTestId('data-table-row-pg-2')).not.toHaveTextContent('15.00%');
    expect(screen.getByTestId('data-table-row-pg-3')).toHaveTextContent('Duur');
    expect(screen.getByTestId('data-table-row-pg-3')).toHaveTextContent('Opslag');
    expect(screen.getByTestId('data-table-row-pg-3')).toHaveTextContent('8%');
  });

  it('adds a new prijsgroep with kortingspercentage, closes the modal, and logs prijsgroep_toegevoegd', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'VIP' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ naam: 'VIP', kortingspercentage: 25, opslagpercentage: null })
    );
    await waitFor(() => expect(screen.queryByTestId('prijsgroep-modal')).not.toBeInTheDocument());
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_toegevoegd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'VIP'
    );
  });

  it('adds a new prijsgroep with opslagpercentage when Opslag is selected as type', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'Groothandel' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-type'), { target: { value: 'opslag' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ naam: 'Groothandel', kortingspercentage: null, opslagpercentage: 5 })
    );
  });

  it('disables Opslaan until naam and percentage are both filled in', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'X' } });
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).toBeDisabled();
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '10' } });
    expect(screen.getByTestId('prijsgroep-modal-opslaan')).not.toBeDisabled();
  });

  it('opens a kortingspercentage row for editing pre-filled, updates it, and logs prijsgroep_gewijzigd', async () => {
    const { onUpdate } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-pg-2'));
    expect(screen.getByTestId('prijsgroep-modal-naam')).toHaveValue('Wholesale');
    expect(screen.getByTestId('prijsgroep-modal-type')).toHaveValue('korting');
    expect(screen.getByTestId('prijsgroep-modal-percentage')).toHaveValue(15);
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('pg-2', {
        naam: 'Wholesale',
        kortingspercentage: 20,
        opslagpercentage: null,
      })
    );
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_gewijzigd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Wholesale'
    );
  });

  it('opens an opslagpercentage row for editing pre-filled with type opslag', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-pg-3'));
    expect(screen.getByTestId('prijsgroep-modal-naam')).toHaveValue('Duur');
    expect(screen.getByTestId('prijsgroep-modal-type')).toHaveValue('opslag');
    expect(screen.getByTestId('prijsgroep-modal-percentage')).toHaveValue(8);
  });

  it('shows an action error and does not log when adding fails', async () => {
    const onAdd = vi.fn().mockResolvedValue(false);
    renderSection({ onAdd });
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    fireEvent.change(screen.getByTestId('prijsgroep-modal-naam'), { target: { value: 'VIP' } });
    fireEvent.change(screen.getByTestId('prijsgroep-modal-percentage'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('prijsgroep-modal-opslaan'));
    expect(await screen.findByTestId('prijsgroep-modal-error')).toHaveTextContent(
      'Er is iets misgegaan. Probeer het opnieuw.'
    );
    expect(logActiviteitMock).not.toHaveBeenCalled();
  });

  it('blocks deleting a prijsgroep that is still assigned to a klant', async () => {
    const { onRemove } = renderSection({
      klanten: [{ id: 'uid-1', prijsgroepId: 'pg-1' } as never],
    });
    fireEvent.click(screen.getByTestId('data-table-row-pg-1'));
    fireEvent.click(screen.getByTestId('prijsgroep-modal-verwijderen'));
    expect(await screen.findByTestId('prijsgroep-modal-error')).toHaveTextContent(
      'Deze prijsgroep is nog aan een klant toegewezen en kan niet verwijderd worden.'
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('deletes a prijsgroep no klant has assigned, and logs prijsgroep_verwijderd', async () => {
    const { onRemove } = renderSection({
      klanten: [{ id: 'uid-1', prijsgroepId: 'pg-2' } as never],
    });
    fireEvent.click(screen.getByTestId('data-table-row-pg-1'));
    fireEvent.click(screen.getByTestId('prijsgroep-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('pg-1'));
    expect(logActiviteitMock).toHaveBeenCalledWith(
      'prijsgroep_verwijderd',
      { id: 'staff-1', email: 'paul@glassartanddesign.com', naam: 'paul@glassartanddesign.com' },
      'Standaard'
    );
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Prijsgroep toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-pg-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Prijsgroep bewerken');
  });

  it('shows the required-field legend', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));
    expect(screen.getByTestId('prijsgroep-modal-verplicht-legende')).toHaveTextContent('* verplicht veld');
  });

  it('shows a help popover explaining that the percentage is applied automatically', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('prijsgroepen-add'));

    fireEvent.click(screen.getByTestId('prijsgroep-modal-help'));
    expect(screen.getByTestId('prijsgroep-modal-help-popover')).toHaveTextContent('automatisch toegepast');
  });
});
