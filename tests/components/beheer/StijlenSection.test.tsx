import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StijlenSection } from '@/components/beheer/StijlenSection';
import type { Stijl } from '@/components/beheer/materiaalTypes';
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
  { id: 'stijl-1', omschrijving: 'Abstract' },
  { id: 'stijl-2', omschrijving: 'Minimalistisch' },
];

function renderSection(overrides: Partial<React.ComponentProps<typeof StijlenSection>> = {}) {
  const onAdd = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onRemove = vi.fn().mockResolvedValue(true);
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <StijlenSection
        stijlen={STIJLEN}
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
    expect(screen.getByTestId('data-table-row-stijl-1')).toHaveTextContent('Abstract');
    expect(screen.getByTestId('data-table-row-stijl-2')).toHaveTextContent('Minimalistisch');
  });

  it('adds a new stijl and closes the modal', async () => {
    const { onAdd } = renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Impressionistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ omschrijving: 'Impressionistisch' }));
    await waitFor(() => expect(screen.queryByTestId('stijl-modal')).not.toBeInTheDocument());
  });

  it('opens a row for editing pre-filled, updates it, and deletes it', async () => {
    const { onUpdate, onRemove } = renderSection();
    fireEvent.click(screen.getByTestId('data-table-row-stijl-2'));
    expect(screen.getByTestId('stijl-modal-omschrijving')).toHaveValue('Minimalistisch');
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Minimalisme' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('stijl-2', { omschrijving: 'Minimalisme' }));

    fireEvent.click(screen.getByTestId('data-table-row-stijl-1'));
    fireEvent.click(screen.getByTestId('stijl-modal-verwijderen'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('stijl-1'));
  });

  it('logs stijl_toegevoegd/gewijzigd/verwijderd with the logged-in medewerker', async () => {
    renderSection();
    fireEvent.click(screen.getByTestId('stijlen-add'));
    fireEvent.change(screen.getByTestId('stijl-modal-omschrijving'), { target: { value: 'Impressionistisch' } });
    fireEvent.click(screen.getByTestId('stijl-modal-opslaan'));
    await waitFor(() =>
      expect(logActiviteitMock).toHaveBeenCalledWith('stijl_toegevoegd', {
        id: 'staff-1',
        email: 'paul@glassartanddesign.com',
        naam: 'paul@glassartanddesign.com',
      })
    );
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
