import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnderwerpenSection } from '@/components/beheer/OnderwerpenSection';
import type { Onderwerp } from '@/components/beheer/materiaalTypes';
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

const ONDERWERPEN: Onderwerp[] = [
  { id: 'onderwerp-1', omschrijving: 'Bloemen' },
  { id: 'onderwerp-2', omschrijving: 'Landschappen' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof OnderwerpenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <OnderwerpenSection
        onderwerpen={ONDERWERPEN}
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
    expect(screen.getByTestId('data-table-row-onderwerp-1')).toHaveTextContent('Bloemen');
    expect(screen.getByTestId('data-table-row-onderwerp-2')).toHaveTextContent('Landschappen');
  });

  it('adds a new onderwerp and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Dieren' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Dieren' }));
    await waitFor(() => expect(screen.queryByTestId('onderwerp-modal')).not.toBeInTheDocument());
  });

  it('opens a row for editing pre-filled, updates it, and deletes it', async () => {
    const { onUpdate, onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-onderwerp-2'));
    expect(screen.getByTestId('onderwerp-modal-omschrijving')).toHaveValue('Landschappen');
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Landschap' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('onderwerp-2', { omschrijving: 'Landschap' }));

    fireEvent.click(screen.getByTestId('data-table-row-onderwerp-1'));
    fireEvent.click(screen.getByTestId('onderwerp-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('onderwerp-1'));
  });

  it('logs onderwerp_toegevoegd with the logged-in medewerker', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    fireEvent.change(screen.getByTestId('onderwerp-modal-omschrijving'), { target: { value: 'Dieren' } });
    fireEvent.click(screen.getByTestId('onderwerp-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('onderwerp_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
  });

  it('shows the toevoegen title when adding and the bewerken title when editing', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('onderwerpen-add'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp toevoegen');
    fireEvent.click(screen.getByTestId('modal-close'));
    fireEvent.click(screen.getByTestId('data-table-row-onderwerp-2'));
    expect(screen.getByTestId('modal-header')).toHaveTextContent('Onderwerp bewerken');
  });
});
